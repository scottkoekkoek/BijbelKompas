/** Pure outbox rules (BK-025, BK-027). No IndexedDB or network here, so they are unit-tested. */
import type { SyncOperation, SyncResult } from "@bk/schemas";
import type { LocalContent, OutboxEntry, PendingChange, SaveReason } from "./types";

const STRENGTH: Record<SaveReason, number> = { pauze: 1, handmatig: 2, afronden: 3 };
const stronger = (a?: SaveReason, b?: SaveReason) => (!a ? b : !b ? a : STRENGTH[b] >= STRENGTH[a] ? b : a);

/** Adds an edit. Newer content replaces older unsent content; the strongest revision reason is kept. */
export function queueChange(
  entry: OutboxEntry | undefined,
  noteId: string,
  change: PendingChange,
  opts: { createdLocally?: boolean; now: number },
): OutboxEntry {
  const base: OutboxEntry = entry ?? {
    noteId,
    createdLocally: opts.createdLocally ?? false,
    base: change.baseVersion ?? null,
    sent: null,
    pending: null,
    queuedAt: opts.now,
    blocked: null,
  };
  const prev = base.pending;
  return {
    ...base,
    pending: {
      content: change.content,
      reason: stronger(prev?.reason, change.reason),
      status: change.status ?? prev?.status,
    },
  };
}

/**
 * The operation to send now: the unanswered one again (same id), or the pending change as a new
 * operation based on the last known server version. Null when nothing can be sent.
 */
export function nextOperation(
  entry: OutboxEntry,
  serverVersion: number | null,
  newId: () => string,
): { entry: OutboxEntry; op: SyncOperation } | null {
  if (entry.blocked) return null;
  if (entry.sent) return { entry, op: entry.sent };
  if (!entry.pending) return null;
  const base = entry.base ?? serverVersion;
  const create = entry.createdLocally && base === null;
  if (!create && base === null) return null; // base unknown: wait for the server copy
  const c = entry.pending.content;
  const op: SyncOperation = {
    operationId: newId(),
    type: create ? "create" : "save",
    noteId: entry.noteId,
    baseVersion: create ? null : base,
    title: c.title,
    noteType: c.noteType,
    eventDate: c.eventDate,
    document: c.document,
    sermon: c.sermon,
    ...(entry.pending.reason ? { reason: entry.pending.reason } : {}),
    ...(entry.pending.status ? { status: entry.pending.status } : {}),
  };
  return { entry: { ...entry, sent: op, pending: null }, op };
}

export type Outcome = "synced" | "conflict" | "rejected" | "retry" | "ignored";

/** Applies the server's answer. Returns the remaining entry (null = nothing left to send). */
export function applyResult(entry: OutboxEntry, result: SyncResult): { entry: OutboxEntry | null; outcome: Outcome } {
  if (!entry.sent || entry.sent.operationId !== result.operationId) return { entry, outcome: "ignored" };
  const status = result.status === "duplicate" ? (result.original ?? "accepted") : result.status;
  switch (status) {
    case "accepted": {
      // only one editor writes a note per browser (a lock), so newer text continues from this version
      const rest: OutboxEntry = { ...entry, sent: null, createdLocally: false, base: result.note?.documentVersion ?? entry.base };
      return { entry: rest.pending ? rest : null, outcome: "synced" };
    }
    case "conflict":
      return { entry: { ...entry, blocked: "conflict" }, outcome: "conflict" };
    case "rejected":
      return { entry: { ...entry, blocked: "rejected", message: result.message ?? "De wijziging werd geweigerd." }, outcome: "rejected" };
    default:
      return { entry, outcome: "retry" };
  }
}

/** The newest text this device has for the note (what a conflict copy must keep). */
export function latestContent(entry: OutboxEntry): LocalContent | null {
  if (entry.pending) return entry.pending.content;
  if (!entry.sent) return null;
  const s = entry.sent;
  return { title: s.title, noteType: s.noteType, eventDate: s.eventDate, sermon: s.sermon ?? emptySermon, document: s.document };
}

const emptySermon = { speaker: null, organization: null, series: null, serviceType: null };

export function copyTitle(title: string, when: Date): string {
  const stamp = when.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${title || "Naamloos"} (conflictkopie ${stamp})`.slice(0, 200);
}

/** Exponential backoff with jitter for failed pushes: 5 s, 10 s, 20 s … at most 5 minutes. */
export function backoffMs(attempt: number, random = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 300_000);
  return Math.round(base * (0.75 + random() * 0.5));
}
