"use client";
import { Bold, BookOpen, Heading2, Heading3, Italic, List, ListOrdered, Quote } from "lucide-react";
import {
  NOTE_TYPE_LABELS,
  NoteType,
  SERVICE_TYPE_SUGGESTIONS,
  type Note,
  type NoteStatus,
  type RevisionReason,
  type SermonDetails,
} from "@bk/schemas";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSyncState } from "@/components/sync/SyncStatus";
import { getStored, listOutbox, saveLocal } from "@/lib/offline/db";
import { editLockName, syncEngine } from "@/lib/offline/engine";
import type { LocalContent } from "@/lib/offline/types";
import { passagePath } from "@/lib/bible";
import { LINKABLE_TYPES, MAX_PASSAGES_PER_BLOCK, samePassage, type LinkedPassage } from "@/lib/notes/document";
import { parseReference, type BookInfo } from "@/lib/notes/reference";
import { noteExtensions } from "./extensions";

export const AUTOSAVE_MS = 1500;
export const PAUSE_MS = 120_000; // "schrijfpauze": 2 minutes without typing makes a revision
const RETRY_MS = 10_000;

type SaveState = "opgeslagen" | "lokaal" | "wijzigingen" | "opslaan" | "fout" | "conflict";
type SaveOpts = { reason?: Exclude<RevisionReason, "herstel">; status?: NoteStatus };

const STATE_TEXT: Record<SaveState, string> = {
  opgeslagen: "Opgeslagen",
  lokaal: "Lokaal opgeslagen",
  wijzigingen: "Wijzigingen…",
  opslaan: "Opslaan…",
  fout: "Niet opgeslagen.",
  conflict: "Conflict: elders gewijzigd.",
};

export type Suggestions = { speakers: string[]; organizations: string[]; series: string[] };
type Props = {
  note: Note;
  books: BookInfo[];
  defaultTranslation: string;
  suggestions: Suggestions;
  /** the text on screen is newer than the server's (it came from this browser's storage) */
  unsynced?: boolean;
  /** when the text was last stored in this browser, to notice edits made in another tab */
  localStamp?: number | null;
  /** offline screen: no server pages, and notes open in place */
  offline?: boolean;
  onOpenNote?: (id: string) => void;
};

/**
 * BK-025/026: local-first editor. Every save goes to this browser's storage first ("Lokaal
 * opgeslagen") and the sync engine sends it to the server ("Opgeslagen"). A change made elsewhere
 * is never overwritten: the writer chooses between a conflict copy and the newest version.
 */
export function NoteEditor({ note, books, defaultTranslation, suggestions, unsynced = false, localStamp = null, offline = false, onOpenNote }: Props) {
  const router = useRouter();
  const ids = useId();
  const sync = useSyncState();
  const [title, setTitle] = useState(note.title);
  const [noteType, setNoteType] = useState<NoteType>(note.noteType);
  const [eventDate, setEventDate] = useState(note.eventDate ?? "");
  const [sermon, setSermon] = useState<SermonDetails>(note.sermon);
  const [status, setStatus] = useState<NoteStatus>(note.status);
  // Ronde 3 §2: a finished note opens in the reading view. While it is open here, the address says
  // "bewerken", so a refresh (or a reload) keeps the editor instead of switching mid-sentence.
  useEffect(() => {
    if (status !== "afgerond" || offline) return;
    const url = new URL(window.location.href);
    if (!url.pathname.startsWith(`/notes/${note.id}`) || url.searchParams.get("bewerken") === "1") return;
    url.searchParams.set("bewerken", "1");
    window.history.replaceState(window.history.state, "", url);
  }, [status, note.id, offline]);
  const [detailsOpen, setDetailsOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches);
  const [saveState, setSaveState] = useState<SaveState>(unsynced ? "lokaal" : "opgeslagen");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(note.currentRevision);
  const [elsewhere, setElsewhere] = useState<"no" | "open" | "closed">("no");

  // Mutable save bookkeeping (refs: timers and in-flight saves must not trigger renders).
  /** the server version the text on screen builds on */
  const version = useRef(note.documentVersion);
  const changes = useRef(0);
  const saved = useRef(0);
  const revisionDirty = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<SaveOpts | null>(null);
  const conflict = useRef(false);
  const readOnly = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const meta = useRef({ title, noteType, eventDate, sermon });
  useEffect(() => {
    meta.current = { title, noteType, eventDate, sermon };
  }, [title, noteType, eventDate, sermon]);
  const editorRef = useRef<Editor | null>(null);
  const saveRef = useRef<(opts?: SaveOpts) => Promise<void>>(async () => undefined);

  const markChanged = useCallback(() => {
    if (conflict.current || readOnly.current) return;
    changes.current += 1;
    revisionDirty.current = true;
    setSaveState("wijzigingen");
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      if (revisionDirty.current) void saveRef.current({ reason: "pauze" });
    }, PAUSE_MS);
  }, []);

  const editor = useEditor({
    extensions: noteExtensions(),
    content: note.document,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "note-body", "aria-label": "Tekst van de notitie", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ transaction }) => {
      if (transaction.docChanged) markChanged();
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // One editor per note per browser: a second tab shows the note read-only (two tabs writing into
  // the same local copy could otherwise lose text without anyone noticing).
  useEffect(() => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return;
    const abort = new AbortController();
    let release: () => void = () => undefined;
    const hold = (lock: Lock | null) =>
      lock ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
    locks
      .request(editLockName(note.id), { ifAvailable: true }, async (lock) => {
        if (lock) return hold(lock);
        readOnly.current = true;
        setElsewhere("open");
        // wait until the other tab closes; then this tab may continue if nothing changed meanwhile
        locks
          .request(editLockName(note.id), { signal: abort.signal }, async (l) => {
            const stored = await getStored(note.id).catch(() => undefined);
            if ((stored?.localUpdatedAt ?? null) === localStamp && (stored?.server?.documentVersion ?? 0) === version.current) {
              readOnly.current = false;
              setElsewhere("no");
            } else {
              setElsewhere("closed");
            }
            return hold(l);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
      release();
    };
  }, [note.id, localStamp]);
  useEffect(() => {
    editor?.setEditable(elsewhere === "no");
  }, [editor, elsewhere]);

  // BK-038: a search result links to /notes/{id}#blok-{blockId}; scroll to that block and mark it.
  // The mark is a style rule rather than a class, because the editor may redraw the block.
  const [foundBlock, setFoundBlock] = useState<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    const m = /^#blok-([0-9a-f-]{36})$/.exec(window.location.hash);
    if (!m) return;
    const id = m[1]!;
    const t1 = setTimeout(() => {
      editor.view.dom.querySelector<HTMLElement>(`[data-block-id="${id}"]`)?.scrollIntoView({ block: "center" });
      setFoundBlock(id);
    }, 50);
    const t2 = setTimeout(() => setFoundBlock(null), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editor]);

  const currentContent = useCallback((): LocalContent | null => {
    const ed = editorRef.current;
    if (!ed) return null;
    const m = meta.current;
    return { title: m.title, noteType: m.noteType, eventDate: m.eventDate || null, sermon: m.sermon, document: ed.getJSON() as LocalContent["document"] };
  }, []);

  /** Fallback when this browser cannot store anything (storage full or blocked): straight to the server. */
  const saveDirect = useCallback(
    async (content: LocalContent, opts: SaveOpts, snapshot: number, storageFull = false) => {
      // AT-14: a full device is said plainly, also when the server did take the text
      const full = "De opslag op dit apparaat is vol, dus offline bewaren lukt nu niet. Ruim ruimte op via Offline en synchronisatie.";
      try {
        const res = await fetch(`/api/v1/notes/${note.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseVersion: version.current, ...content, ...opts }),
        });
        if (res.ok) {
          const body = (await res.json()) as Note;
          version.current = body.documentVersion;
          saved.current = snapshot;
          setStatus(body.status);
          setRevision(body.currentRevision);
          setSaveState(changes.current === saved.current ? "opgeslagen" : "wijzigingen");
          if (storageFull) setMessage(full);
        } else if (res.status === 409) {
          conflict.current = true;
          setSaveState("conflict");
        } else {
          setSaveState("fout");
          const body = await res.json().catch(() => null);
          setMessage(body?.error?.message ?? "De notitie kon niet worden opgeslagen.");
        }
      } catch {
        setSaveState("fout");
        setMessage(
          storageFull
            ? `Niet opgeslagen: geen verbinding en ${full.charAt(0).toLowerCase()}${full.slice(1)} Je tekst blijft staan; we proberen het opnieuw.`
            : "Niet opgeslagen: geen verbinding en deze browser kan niets lokaal bewaren. Je tekst blijft staan; we proberen het opnieuw.",
        );
        retryTimer.current = setTimeout(() => void saveRef.current(opts), RETRY_MS);
      }
    },
    [note.id],
  );

  const save = useCallback(
    async (opts: SaveOpts = {}) => {
      if (conflict.current || readOnly.current) return;
      if (inFlight.current) {
        pending.current = { ...pending.current, ...opts };
        return;
      }
      const content = currentContent();
      if (!content) return;
      clearTimeout(autosaveTimer.current);
      clearTimeout(retryTimer.current);
      const snapshot = changes.current;
      inFlight.current = true;
      setSaveState("opslaan");
      try {
        await saveLocal(note.id, { content, ...opts, baseVersion: version.current > 0 ? version.current : null });
        saved.current = snapshot;
        if (opts.reason && snapshot === changes.current) revisionDirty.current = false;
        if (opts.status) setStatus(opts.status);
        setMessage(
          opts.status === "afgerond"
            ? "Afgerond. Wordt als versie bewaard zodra de notitie is verstuurd."
            : opts.reason === "handmatig"
              ? "Wordt als nieuwe versie bewaard zodra de notitie is verstuurd."
              : "",
        );
        setSaveState(changes.current === saved.current ? "lokaal" : "wijzigingen");
        syncEngine.syncSoon(opts.reason || opts.status ? 0 : 300);
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        await saveDirect(content, opts, snapshot, name === "QuotaExceededError" || (err as { inner?: { name?: string } })?.inner?.name === "QuotaExceededError");
      } finally {
        inFlight.current = false;
      }
      const next = pending.current;
      pending.current = null;
      if (conflict.current) return;
      if (next) void saveRef.current(next);
      else if (changes.current !== saved.current) {
        autosaveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
      }
    },
    [note.id, currentContent, saveDirect],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // What the sync engine reports for this note (also when another tab sent it).
  useEffect(
    () =>
      syncEngine.onNote(note.id, (e) => {
        if (e.type === "synced") {
          version.current = e.note.documentVersion;
          if (e.stillPending) return;
          setStatus(e.note.status);
          setRevision(e.note.currentRevision);
          if (e.op.status === "afgerond") setMessage("Notitie afgerond en als versie bewaard.");
          else if (e.op.reason === "handmatig") setMessage("Opgeslagen als nieuwe versie.");
          setSaveState((s) => (s === "lokaal" ? "opgeslagen" : s));
        } else if (e.type === "conflict") {
          conflict.current = true;
          clearTimeout(autosaveTimer.current);
          clearTimeout(pauseTimer.current);
          setSaveState("conflict");
        } else {
          setSaveState("fout");
          setMessage(e.message);
        }
      }),
    [note.id],
  );
  useEffect(() => {
    if (unsynced) syncEngine.syncSoon(0);
  }, [unsynced]);

  // Metadata changes autosave as well.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    markChanged();
  }, [title, noteType, eventDate, sermon, markChanged]);

  // Warn before leaving with text not yet stored; store it when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (changes.current !== saved.current) e.preventDefault();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden" && changes.current !== saved.current) void saveRef.current();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
      clearTimeout(autosaveTimer.current);
      clearTimeout(pauseTimer.current);
      clearTimeout(retryTimer.current);
    };
  }, []);

  /** Keeps the text on screen as a new note; the original follows the server again (ADR-000). */
  async function keepCopy() {
    const content = currentContent();
    if (!content) return;
    try {
      await saveLocal(note.id, { content });
      const copyId = await syncEngine.resolveAsCopy(note.id);
      if (!copyId) throw new Error("no copy");
      changes.current = saved.current; // nothing unsaved any more: it lives in the copy
      if (onOpenNote) return onOpenNote(copyId);
      await syncEngine.syncNow();
      const waiting = (await listOutbox()).some((e) => e.noteId === copyId);
      router.push(waiting ? `/offline?notitie=${copyId}` : `/notes/${copyId}`);
    } catch {
      setMessage("De kopie kon niet worden bewaard. Kopieer je tekst handmatig voordat je verdergaat.");
    }
  }

  async function loadLatest() {
    await syncEngine.discardLocal(note.id).catch(() => undefined);
    changes.current = saved.current;
    window.location.reload();
  }

  const waitingText =
    saveState === "lokaal" && sync.status === "offline"
      ? "Lokaal opgeslagen · wordt verstuurd zodra er verbinding is"
      : saveState === "lokaal" && sync.status === "auth"
        ? "Lokaal opgeslagen · log opnieuw in om te versturen"
        : STATE_TEXT[saveState];
  const locked = saveState === "conflict" || elsewhere !== "no";
  const detailsSummary = [
    NOTE_TYPE_LABELS[noteType],
    eventDate ? new Date(`${eventDate}T00:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null,
    noteType === "preek" ? sermon.speaker : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="note-editor">
      {elsewhere !== "no" && (
        <div className="alert error" role="alert">
          {elsewhere === "open" ? (
            <p>Deze notitie is al geopend in een ander tabblad. Schrijf daar verder, of sluit dat tabblad.</p>
          ) : (
            <>
              <p>Het andere tabblad is gesloten. Laad de notitie opnieuw om hier verder te schrijven.</p>
              <button type="button" className="button" onClick={() => window.location.reload()}>Opnieuw laden</button>
            </>
          )}
        </div>
      )}
      <fieldset className="note-meta plain note-head" disabled={elsewhere !== "no"}>
        <div className="field note-title">
          <label htmlFor={`${ids}-title`} className="visually-hidden">Titel</label>
          <input id={`${ids}-title`} type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Naamloze notitie" />
        </div>
        <div className="note-status-row">
          <span className={`badge ${status}`}>{status === "afgerond" ? "Afgerond" : "Concept"}</span>
          <span className={`save-state ${saveState}`} role="status" aria-live="polite">
            {waitingText}
          </span>
          {revision > 0 && !offline && (
            <Link href={`/notes/${note.id}/versies`} className="muted-link">
              {revision} {revision === 1 ? "versie" : "versies"}
            </Link>
          )}
        </div>
      </fieldset>

      {/* less used fields: open on wide screens, folded on a phone so the text gets the room */}
      <details className="note-details" open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
        <summary>
          <span className="note-details-label">Gegevens</span>
          <span className="note-details-value">{detailsSummary}</span>
        </summary>
        <fieldset className="note-meta plain note-fields" disabled={elsewhere !== "no"}>
          <legend className="visually-hidden">Soort en datum</legend>
          <div className="field">
            <label htmlFor={`${ids}-type`}>Soort</label>
            <select id={`${ids}-type`} value={noteType} onChange={(e) => setNoteType(NoteType.parse(e.target.value))}>
              {NoteType.options.map((t) => (
                <option key={t} value={t}>
                  {NOTE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-date`}>Datum van preek of gebeurtenis</label>
            <input id={`${ids}-date`} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} aria-describedby={`${ids}-date-hint`} />
            <p id={`${ids}-date-hint`} className="hint">Optioneel. Hiermee komt de notitie op de juiste plek in de tijdlijn.</p>
          </div>
        </fieldset>

        {noteType === "preek" && (
          <fieldset className="sermon-fields" disabled={elsewhere !== "no"}>
            <legend>Preekgegevens</legend>
            <SermonField id={`${ids}-speaker`} label="Spreker" value={sermon.speaker} options={suggestions.speakers} max={120}
              onChange={(v) => setSermon((s) => ({ ...s, speaker: v }))} />
            <SermonField id={`${ids}-org`} label="Kerk of gemeente" value={sermon.organization} options={suggestions.organizations} max={120}
              onChange={(v) => setSermon((s) => ({ ...s, organization: v }))} />
            <SermonField id={`${ids}-series`} label="Serie" value={sermon.series} options={suggestions.series} max={120}
              onChange={(v) => setSermon((s) => ({ ...s, series: v }))} />
            <SermonField id={`${ids}-service`} label="Dienst" value={sermon.serviceType} options={SERVICE_TYPE_SUGGESTIONS} max={60}
              onChange={(v) => setSermon((s) => ({ ...s, serviceType: v }))} />
          </fieldset>
        )}

      </details>

      <div className="doc-bar">
      <div className="note-actions">
        <button type="button" className="button secondary" disabled={locked} onClick={() => void save({ reason: "handmatig" })} aria-describedby={`${ids}-save-hint`}>
          Opslaan als versie
        </button>
        {status === "concept" ? (
          <button type="button" className="button" disabled={locked} onClick={() => void save({ reason: "afronden", status: "afgerond" })}>
            Afronden
          </button>
        ) : (
          <button type="button" className="button secondary" disabled={locked} onClick={() => void save({ status: "concept" })}>
            Terugzetten naar concept
          </button>
        )}
        {status === "afgerond" && !offline && (
          <Link className="button ghost" href={`/notes/${note.id}`}>
            Naar leesweergave
          </Link>
        )}
      </div>
      <p id={`${ids}-save-hint`} className="hint doc-hint">
        Je tekst wordt vanzelf bewaard. Met “Opslaan als versie” leg je een vast punt vast waar je later naar terug kunt; met “Afronden” markeer je de notitie als klaar.
      </p>
      </div>

      {saveState === "conflict" && (
        <div className="alert error" role="alert">
          <p>
            Deze notitie is intussen ergens anders gewijzigd (op een ander apparaat of in een ander tabblad). Je tekst
            hier is <strong>niet</strong> overschreven en staat veilig op dit apparaat.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={() => void keepCopy()}>
              Bewaar mijn tekst als conflictkopie
            </button>
            {!offline && (
              <button type="button" className="button secondary" onClick={() => void loadLatest()}>
                Nieuwste versie laden (mijn wijzigingen hier vervallen)
              </button>
            )}
          </div>
        </div>
      )}

      {foundBlock && (
        <style>{`.note-body [data-block-id="${foundBlock}"] { animation: found 6s ease-out; border-radius: 4px; }`}</style>
      )}
      {editor && elsewhere === "no" && <Toolbar editor={editor} books={books} defaultTranslation={defaultTranslation} />}
      <EditorContent editor={editor} className="note-content" />

      {message && <p className="copy-status">{message}</p>}
    </div>
  );
}

function SermonField(props: { id: string; label: string; value: string | null; options: string[]; max: number; onChange: (v: string | null) => void }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="text"
        list={`${props.id}-list`}
        maxLength={props.max}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value === "" ? null : e.target.value)}
        autoComplete="off"
      />
      <datalist id={`${props.id}-list`}>
        {props.options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

function Toolbar({ editor, books, defaultTranslation }: { editor: Editor; books: BookInfo[]; defaultTranslation: string }) {
  const pathname = usePathname();
  const id = useId();
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      ...currentBlock(e),
    }),
  });

  const btn = (label: string, active: boolean, run: () => void, text: React.ReactNode) => (
    <button type="button" className="tool" aria-pressed={active} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {text}
    </button>
  );

  function parse() {
    const parsed = parseReference(ref, books);
    if ("error" in parsed) {
      setError(parsed.error);
      return null;
    }
    setError("");
    return parsed;
  }

  function insertReference(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parse();
    if (!parsed) return;
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "bibleReference",
          attrs: {
            label: parsed.label,
            translation: defaultTranslation,
            book: parsed.book.code,
            startChapter: parsed.startChapter,
            startVerse: parsed.startVerse,
            endChapter: parsed.endChapter,
            endVerse: parsed.endVerse,
          },
        },
        { type: "paragraph" },
      ])
      .run();
    setRef("");
  }

  /** BK-030: links the block with the cursor to the passage, without adding a block. */
  function linkToBlock() {
    const parsed = parse();
    if (!parsed) return;
    const passage: LinkedPassage = {
      label: parsed.label,
      translation: defaultTranslation,
      book: parsed.book.code,
      startChapter: parsed.startChapter,
      startVerse: parsed.startVerse,
      endChapter: parsed.endChapter,
      endVerse: parsed.endVerse,
    };
    if (s.passages.some((p) => samePassage(p, passage))) {
      setError(`Deze alinea is al gekoppeld aan ${parsed.label}.`);
      return;
    }
    if (s.passages.length >= MAX_PASSAGES_PER_BLOCK) {
      setError(`Een alinea kan aan hoogstens ${MAX_PASSAGES_PER_BLOCK} passages gekoppeld worden.`);
      return;
    }
    setPassages(editor, s.blockPos, [...s.passages, passage]);
    setRef("");
  }

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label="Opmaak">
        {btn("Vet", s.bold, () => editor.chain().focus().toggleBold().run(), <Bold size={18} strokeWidth={2.25} aria-hidden="true" />)}
        {btn("Cursief", s.italic, () => editor.chain().focus().toggleItalic().run(), <Italic size={18} strokeWidth={2.25} aria-hidden="true" />)}
        <span className="tool-sep" aria-hidden="true" />
        {btn("Kop", s.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={19} strokeWidth={2} aria-hidden="true" />)}
        {btn("Subkop", s.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={19} strokeWidth={2} aria-hidden="true" />)}
        <span className="tool-sep" aria-hidden="true" />
        {btn("Opsomming", s.bullet, () => editor.chain().focus().toggleBulletList().run(), <List size={19} strokeWidth={2} aria-hidden="true" />)}
        {btn("Genummerde lijst", s.ordered, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={19} strokeWidth={2} aria-hidden="true" />)}
        {btn("Citaat", s.quote, () => editor.chain().focus().toggleBlockquote().run(), <Quote size={18} strokeWidth={2} aria-hidden="true" />)}
      </div>
      <form className="ref-form" onSubmit={insertReference}>
        <BookOpen className="ref-form-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <label htmlFor={`${id}-ref`} className="visually-hidden">
          Bijbelverwijzing invoegen
        </label>
        <input
          id={`${id}-ref`}
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Bijbelverwijzing, bijv. Joh 3:16-18"
          aria-describedby={error ? `${id}-referr` : undefined}
          aria-invalid={error ? true : undefined}
        />
        <button type="submit" className="button secondary">
          Invoegen
        </button>
        <button type="button" className="button secondary" disabled={!s.linkable} onClick={linkToBlock}
          title={s.linkable ? undefined : "Zet de cursor eerst in een alinea"}>
          Koppel aan alinea
        </button>
        {error && (
          <p id={`${id}-referr`} className="field-error">
            {error}
          </p>
        )}
      </form>
      {s.passages.length > 0 && (
        <div className="block-links" role="group" aria-label="Koppelingen van deze alinea">
          <span className="block-links-label">Deze alinea is gekoppeld aan</span>
          <ul>
            {s.passages.map((p) => (
              <li key={`${p.book}${p.startChapter}:${p.startVerse}-${p.endChapter}:${p.endVerse}`} className="passage-chip">
                <Link href={passagePath(p, pathname)}>{p.label}</Link>
                <button
                  type="button"
                  aria-label={`Koppeling ${p.label} verwijderen`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPassages(editor, s.blockPos, s.passages.filter((q) => !samePassage(q, p)))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The top-level block holding the cursor: whether it can be linked, and its current links. */
function currentBlock(e: Editor): { linkable: boolean; passages: LinkedPassage[]; blockPos: number } {
  const { doc, selection } = e.state;
  const index = doc.resolve(selection.from).index(0);
  if (index >= doc.childCount) return { linkable: false, passages: [], blockPos: -1 };
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const node = doc.child(index);
  return {
    linkable: LINKABLE_TYPES.has(node.type.name),
    passages: (node.attrs.passages as LinkedPassage[] | null) ?? [],
    blockPos: pos,
  };
}

function setPassages(editor: Editor, pos: number, passages: LinkedPassage[]) {
  if (pos < 0) return;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, passages: passages.length ? passages : null });
      return true;
    })
    .run();
}
