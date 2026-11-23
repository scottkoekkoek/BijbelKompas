/**
 * Sync engine (BK-026, BK-027, BK-028; spec §14, ADR-006). Runs in the browser only.
 *
 * Push: the outbox in queue order; an unanswered operation is resent with the same id.
 * Pull: note summaries since the cursor; the offline copy keeps the recent notes, pinned notes and
 * everything with unsynced text. Nothing is ever overwritten: a conflict on a note that is open is
 * shown to the writer; on a note that is not open the local text becomes a conflict copy.
 */
import { EMPTY_SERMON, type Note, type NoteSummary, type SyncOperation, type SyncResult } from "@bk/schemas";
import {
  db,
  deviceId,
  getMeta,
  listConflicts,
  listOutbox,
  listStored,
  setMeta,
  type Meta,
} from "./db";
import { pruneOfflineBible } from "./bible";
import { applyResult, backoffMs, copyTitle, latestContent, nextOperation, queueChange } from "./outbox";
import type { ConflictRecord, NoteEvent, OutboxEntry, StoredNote } from "./types";

export type SyncStatus = "idle" | "syncing" | "offline" | "auth" | "error";
export type SyncState = {
  status: SyncStatus;
  pending: number;
  conflicts: number;
  rejected: number;
  lastSyncAt: number | null;
};

const INTERVAL_MS = 60_000;

class SyncEngine {
  private state: SyncState = { status: "idle", pending: 0, conflicts: 0, rejected: 0, lastSyncAt: null };
  private listeners = new Set<() => void>();
  private noteListeners = new Map<string, Set<(e: NoteEvent) => void>>();
  private openNotes = new Map<string, number>();
  private running: Promise<void> | null = null;
  private again = false;
  private started = false;
  private soonTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private registered = false;
  private channel: BroadcastChannel | null = null;

  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  onNote(noteId: string, fn: (e: NoteEvent) => void) {
    let set = this.noteListeners.get(noteId);
    if (!set) this.noteListeners.set(noteId, (set = new Set()));
    set.add(fn);
    this.openNotes.set(noteId, (this.openNotes.get(noteId) ?? 0) + 1);
    return () => {
      set!.delete(fn);
      const n = (this.openNotes.get(noteId) ?? 1) - 1;
      if (n <= 0) this.openNotes.delete(noteId);
      else this.openNotes.set(noteId, n);
    };
  }
  /** Tells the editor of a note, also when it is open in another tab of this browser. */
  private emit(noteId: string, e: NoteEvent) {
    this.dispatch(noteId, e);
    this.channel?.postMessage({ noteId, event: e });
  }
  private dispatch(noteId: string, e: NoteEvent) {
    for (const fn of this.noteListeners.get(noteId) ?? []) fn(e);
  }

  /** Is an editor for this note open in any tab? (editors hold a Web Lock per note) */
  private async openAnywhere(noteId: string): Promise<boolean> {
    if (this.openNotes.has(noteId)) return true;
    try {
      const held = (await navigator.locks?.query())?.held ?? [];
      return held.some((l) => l.name === editLockName(noteId));
    } catch {
      return false;
    }
  }

  /** Starts listening for connectivity and runs a first sync. Safe to call more than once. */
  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("bijbelkompas-sync");
      this.channel.onmessage = (m: MessageEvent<{ noteId: string; event: NoteEvent }>) => {
        this.dispatch(m.data.noteId, m.data.event);
        void this.refreshCounts();
      };
    }
    window.addEventListener("online", () => this.syncSoon(0));
    window.addEventListener("offline", () => this.set({ status: "offline" }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.syncSoon(0);
    });
    setInterval(() => this.syncSoon(0), INTERVAL_MS);
    void this.refreshCounts();
    this.syncSoon(0);
  }

  syncSoon(delay = 400) {
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => void this.syncNow(), delay);
  }

  /** Runs push + pull now (or once more after the current run). */
  async syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.set({ status: "offline" });
      await this.refreshCounts();
      return;
    }
    this.set({ status: "syncing" });
    try {
      await this.ensureDevice();
      await this.push();
      await this.pull();
      this.attempts = 0;
      clearTimeout(this.retryTimer);
      const lastSyncAt = Date.now();
      await setMeta({ lastSyncAt });
      this.set({ status: "idle", lastSyncAt });
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      if (kind === "auth") {
        this.set({ status: "auth" });
      } else {
        this.attempts += 1;
        this.set({ status: navigator.onLine && kind !== "network" ? "error" : "offline" });
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.syncSoon(0), backoffMs(this.attempts));
      }
    } finally {
      await this.refreshCounts();
    }
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...init?.headers } });
    } catch {
      throw Object.assign(new Error("network"), { kind: "network" });
    }
    if (res.status === 401) throw Object.assign(new Error("auth"), { kind: "auth" });
    if (!res.ok) throw Object.assign(new Error(`http ${res.status}`), { kind: "http", status: res.status });
    return (await res.json()) as T;
  }

  private async ensureDevice() {
    if (this.registered) return;
    const id = await deviceId();
    const label = navigator.userAgent.includes("Mobile") ? "Telefoon of tablet" : "Computer";
    const r = await this.request<{ userId: string; recentLimit: number }>("/api/v1/sync/devices", {
      method: "POST",
      body: JSON.stringify({ deviceId: id, label }),
    });
    const meta = await getMeta();
    if (meta.userId && meta.userId !== r.userId) {
      // another account on this browser: never mix data (the old account's unsynced text stays put)
      throw Object.assign(new Error("other account"), { kind: "auth" });
    }
    const patch: Partial<Meta> = { userId: r.userId, recentLimit: r.recentLimit };
    if (meta.books.length === 0) {
      const b = await this.request<{ books: { code: string; name: string; chapterCount: number }[] }>("/api/v1/bible/books");
      patch.books = b.books.map((x) => ({ code: x.code, name: x.name, chapterCount: x.chapterCount }));
    }
    await setMeta(patch);
    this.registered = true;
  }

  // ---------------------------------------------------------------- push
  private async push() {
    const device = await deviceId();
    for (let round = 0; round < 50; round++) {
      const batch = await this.collectBatch();
      if (batch.length === 0) return;
      const { results } = await this.request<{ results: SyncResult[] }>("/api/v1/sync/push", {
        method: "POST",
        body: JSON.stringify({ deviceId: device, operations: batch.map((b) => b.op) }),
      });
      let progressed = false;
      for (const { op } of batch) {
        const result = results.find((r) => r.operationId === op.operationId);
        if (!result) continue;
        if (await this.handleResult(op, result)) progressed = true;
      }
      if (!progressed) return; // only retryable answers: try again later
    }
  }

  /** Marks the next operation of every entry as sent (persisted before the network call). */
  private async collectBatch(): Promise<{ op: SyncOperation }[]> {
    const d = await db();
    const tx = d.transaction(["outbox", "notes"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const notes = tx.objectStore("notes");
    const entries = (await outbox.getAll()).sort((a, b) => a.queuedAt - b.queuedAt);
    const batch: { op: SyncOperation }[] = [];
    for (const entry of entries) {
      if (batch.length >= 20) break;
      const stored = await notes.get(entry.noteId);
      const next = nextOperation(entry, stored?.server?.documentVersion ?? null, () => crypto.randomUUID());
      if (!next) continue;
      if (next.entry !== entry) await outbox.put(next.entry);
      batch.push({ op: next.op });
    }
    await tx.done;
    return batch;
  }

  /** Applies one answer; returns true when the outbox moved forward. */
  private async handleResult(op: SyncOperation, result: SyncResult): Promise<boolean> {
    const d = await db();
    const tx = d.transaction(["outbox", "notes"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const notes = tx.objectStore("notes");
    const entry = await outbox.get(op.noteId);
    if (!entry) {
      await tx.done;
      return false;
    }
    const { entry: rest, outcome } = applyResult(entry, result);
    if (outcome === "retry" || outcome === "ignored") {
      await tx.done;
      return false;
    }
    const stored = await notes.get(op.noteId);
    if (outcome === "synced" && result.note) {
      const server: Note = {
        ...(stored?.server ?? { sermon: EMPTY_SERMON }),
        ...result.note,
        document: op.document,
        sermon: op.sermon ?? stored?.server?.sermon ?? EMPTY_SERMON,
      } as Note;
      await notes.put({
        id: op.noteId,
        server,
        local: rest ? (stored?.local ?? null) : null,
        localUpdatedAt: rest ? (stored?.localUpdatedAt ?? null) : null,
        pinned: stored?.pinned ?? false,
        openedAt: stored?.openedAt ?? Date.now(),
      });
    }
    if (rest) await outbox.put(rest);
    else await outbox.delete(op.noteId);
    await tx.done;

    if (outcome === "synced" && result.note) {
      this.emit(op.noteId, { type: "synced", note: result.note, op, stillPending: Boolean(rest?.pending || rest?.sent) });
    } else if (outcome === "conflict") {
      if (await this.openAnywhere(op.noteId)) this.emit(op.noteId, { type: "conflict", current: result.note ?? null });
      else await this.resolveAsCopy(op.noteId);
    } else if (outcome === "rejected") {
      this.emit(op.noteId, { type: "rejected", message: rest?.message ?? "Geweigerd." });
    }
    return true;
  }

  /**
   * Keeps this device's text as a NEW note (conflict copy) and lets the original follow the server
   * again. Nothing is lost and nothing is overwritten (ADR-000). Returns the copy's id.
   */
  async resolveAsCopy(noteId: string): Promise<string | null> {
    const d = await db();
    const tx = d.transaction(["outbox", "notes", "conflicts"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const notes = tx.objectStore("notes");
    const entry = await outbox.get(noteId);
    const stored = await notes.get(noteId);
    const content = (entry && latestContent(entry)) ?? stored?.local ?? null;
    if (!content) {
      await tx.done;
      return null;
    }
    const now = Date.now();
    const copyId = crypto.randomUUID();
    const title = copyTitle(content.title, new Date(now));
    const copy = { ...content, title };
    await notes.put({ id: copyId, server: null, local: copy, localUpdatedAt: now, pinned: true, openedAt: now });
    await outbox.put(queueChange(undefined, copyId, { content: copy }, { createdLocally: true, now }));
    const record: ConflictRecord = { id: crypto.randomUUID(), noteId, copyNoteId: copyId, title: content.title, at: now, resolved: false };
    await tx.objectStore("conflicts").put(record);
    await outbox.delete(noteId);
    if (stored) await notes.put({ ...stored, local: null, localUpdatedAt: null, server: stored.server ? { ...stored.server, documentVersion: 0 } : null });
    await tx.done;
    await this.refreshCounts();
    this.syncSoon(0);
    return copyId;
  }

  /** Drops this device's unsynced text for a note (the writer chose "Nieuwste versie laden"). */
  async discardLocal(noteId: string) {
    const d = await db();
    const tx = d.transaction(["outbox", "notes"], "readwrite");
    await tx.objectStore("outbox").delete(noteId);
    const stored = await tx.objectStore("notes").get(noteId);
    if (stored) await tx.objectStore("notes").put({ ...stored, local: null, localUpdatedAt: null, server: stored.server ? { ...stored.server, documentVersion: 0 } : null });
    await tx.done;
    await this.refreshCounts();
  }

  async markConflictResolved(id: string) {
    const d = await db();
    const rec = await d.get("conflicts", id);
    if (rec) await d.put("conflicts", { ...rec, resolved: true });
    await this.refreshCounts();
  }

  // ---------------------------------------------------------------- pull
  private async pull() {
    let meta = await getMeta();
    const index = { ...meta.index };
    let cursor = meta.cursor;
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ limit: "200", ...(cursor ? { cursor } : {}) });
      const r = await this.request<{ notes: NoteSummary[]; nextCursor: string | null; hasMore: boolean }>(`/api/v1/sync/pull?${q}`);
      for (const n of r.notes) index[n.id] = { updatedAt: n.updatedAt, version: n.documentVersion, archived: n.archived || n.trashed === true, title: n.title };
      cursor = r.nextCursor;
      meta = await setMeta({ index, cursor });
      if (!r.hasMore) break;
    }
    meta = await this.refreshPinnedCollections(meta);
    await this.refreshOfflineCopy(meta);
    await this.checkOfflineBible(meta);
  }

  /** BK-014: Bible text whose rights no longer allow offline use is removed from this device. */
  private async checkOfflineBible(meta: Meta) {
    if (Object.keys(meta.offlineBible).length === 0) return;
    const r = await this.request<{ translations: { code: string }[] }>("/api/v1/bible/offline");
    await pruneOfflineBible(r.translations.map((t) => t.code));
  }

  /** Sprint 7: which notes are in the collections kept offline now (a deleted collection drops out). */
  private async refreshPinnedCollections(meta: Meta): Promise<Meta> {
    const asked = Object.keys(meta.pinnedCollections);
    if (asked.length === 0) return meta;
    const r = await this.request<{ collections: { id: string; name: string; noteIds: string[] }[] }>(
      `/api/v1/collections/offline?ids=${asked.slice(0, 50).join(",")}`,
    );
    const fresh = await getMeta(); // pinned or unpinned meanwhile: that choice wins
    const next: Meta["pinnedCollections"] = {};
    for (const c of r.collections) if (fresh.pinnedCollections[c.id]) next[c.id] = { name: c.name, noteIds: c.noteIds };
    for (const [id, v] of Object.entries(fresh.pinnedCollections)) if (!asked.includes(id)) next[id] = v;
    return setMeta({ pinnedCollections: next });
  }

  /** Downloads what should be offline and removes what no longer needs to be (never unsynced text). */
  private async refreshOfflineCopy(meta: Meta) {
    const [stored, outbox] = await Promise.all([listStored(), listOutbox()]);
    const dirty = new Set([...outbox.map((e) => e.noteId), ...stored.filter((s) => s.local).map((s) => s.id)]);
    const recent = Object.entries(meta.index)
      .filter(([, v]) => !v.archived)
      .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
      .slice(0, meta.recentLimit)
      .map(([id]) => id);
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const keep = new Set([
      ...recent,
      ...stored.filter((s) => s.pinned || s.openedAt > weekAgo).map((s) => s.id),
      ...Object.values(meta.pinnedCollections).flatMap((c) => c.noteIds),
      ...dirty,
    ]);
    const byId = new Map(stored.map((s) => [s.id, s]));
    const need = [...keep].filter((id) => {
      const info = meta.index[id];
      if (!info || dirty.has(id)) return false;
      const s = byId.get(id);
      return !s?.server || s.server.documentVersion < info.version;
    });
    for (let i = 0; i < need.length; i += 20) {
      const ids = need.slice(i, i + 20);
      const r = await this.request<{ notes: Note[] }>(`/api/v1/sync/notes?ids=${ids.join(",")}`);
      const d = await db();
      const tx = d.transaction("notes", "readwrite");
      for (const n of r.notes) {
        const prev = await tx.store.get(n.id);
        if (prev?.local) continue; // typed meanwhile: keep it
        await tx.store.put({ id: n.id, server: n, local: null, localUpdatedAt: null, pinned: prev?.pinned ?? false, openedAt: prev?.openedAt ?? 0 });
      }
      await tx.done;
    }
    const d = await db();
    const tx = d.transaction("notes", "readwrite");
    for (const s of stored) {
      if (!keep.has(s.id) && !s.pinned && !s.local && !dirty.has(s.id) && !this.openNotes.has(s.id)) await tx.store.delete(s.id);
    }
    await tx.done;
  }

  async refreshCounts() {
    try {
      const [outbox, conflicts] = await Promise.all([listOutbox(), listConflicts()]);
      this.set({
        pending: outbox.filter((e: OutboxEntry) => !e.blocked).length,
        rejected: outbox.filter((e) => e.blocked === "rejected").length,
        conflicts: conflicts.filter((c) => !c.resolved).length,
      });
    } catch {
      // IndexedDB unavailable (private mode): the app still works online
    }
  }
}

/** The Web Lock an open editor holds, so a note is edited in one tab at a time. */
export const editLockName = (noteId: string) => `bijbelkompas-note:${noteId}`;

/** One engine per browser tab. */
export const syncEngine = new SyncEngine();

export type { StoredNote };
