"use client";
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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseReference, type BookInfo } from "@/lib/notes/reference";
import { noteExtensions } from "./extensions";

export const AUTOSAVE_MS = 1500;
export const PAUSE_MS = 120_000; // "schrijfpauze": 2 minutes without typing makes a revision
const RETRY_MS = 10_000;

type SaveState = "opgeslagen" | "wijzigingen" | "opslaan" | "offline" | "fout" | "conflict";
type SaveOpts = { reason?: Exclude<RevisionReason, "herstel">; status?: NoteStatus };

const STATE_TEXT: Record<SaveState, string> = {
  opgeslagen: "Opgeslagen",
  wijzigingen: "Wijzigingen…",
  opslaan: "Opslaan…",
  offline: "Niet opgeslagen: geen verbinding. Je tekst blijft staan; we proberen het opnieuw.",
  fout: "Niet opgeslagen.",
  conflict: "Niet opgeslagen: conflict.",
};

export type Suggestions = { speakers: string[]; organizations: string[]; series: string[] };
type Props = { note: Note; books: BookInfo[]; defaultTranslation: string; suggestions: Suggestions };

export function NoteEditor({ note, books, defaultTranslation, suggestions }: Props) {
  const router = useRouter();
  const ids = useId();
  const [title, setTitle] = useState(note.title);
  const [noteType, setNoteType] = useState<NoteType>(note.noteType);
  const [eventDate, setEventDate] = useState(note.eventDate ?? "");
  const [sermon, setSermon] = useState<SermonDetails>(note.sermon);
  const [status, setStatus] = useState<NoteStatus>(note.status);
  const [saveState, setSaveState] = useState<SaveState>("opgeslagen");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(note.currentRevision);

  // Mutable save bookkeeping (refs: timers and in-flight saves must not trigger renders).
  const version = useRef(note.documentVersion);
  const changes = useRef(0);
  const saved = useRef(0);
  const revisionDirty = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<SaveOpts | null>(null);
  const conflict = useRef(false);
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
    if (conflict.current) return;
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

  const save = useCallback(
    async (opts: SaveOpts = {}) => {
      const ed = editorRef.current;
      if (!ed || conflict.current) return;
      if (inFlight.current) {
        pending.current = { ...pending.current, ...opts };
        return;
      }
      clearTimeout(autosaveTimer.current);
      clearTimeout(retryTimer.current);
      const snapshot = changes.current;
      inFlight.current = true;
      setSaveState("opslaan");
      try {
        const res = await fetch(`/api/v1/notes/${note.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseVersion: version.current,
            title: meta.current.title,
            noteType: meta.current.noteType,
            eventDate: meta.current.eventDate || null,
            sermon: meta.current.sermon,
            document: ed.getJSON(),
            ...opts,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as Note;
          version.current = body.documentVersion;
          saved.current = snapshot;
          if (opts.reason && snapshot === changes.current) revisionDirty.current = false;
          setStatus(body.status);
          setRevision(body.currentRevision);
          setMessage(
            opts.status === "afgerond"
              ? "Notitie afgerond en als versie bewaard."
              : opts.reason === "handmatig"
                ? "Opgeslagen als nieuwe versie."
                : "",
          );
          setSaveState(changes.current === saved.current ? "opgeslagen" : "wijzigingen");
        } else if (res.status === 409) {
          conflict.current = true;
          clearTimeout(pauseTimer.current);
          setSaveState("conflict");
        } else if (res.status === 401) {
          setSaveState("fout");
          setMessage("Je bent uitgelogd. Log in een ander tabblad opnieuw in; je tekst blijft hier staan.");
          retryTimer.current = setTimeout(() => void saveRef.current(opts), RETRY_MS);
        } else if (res.status === 422) {
          setSaveState("fout");
          const body = await res.json().catch(() => null);
          setMessage(body?.error?.message ?? "De notitie bevat iets wat niet kan worden opgeslagen.");
        } else {
          throw new Error(String(res.status));
        }
      } catch {
        setSaveState("offline");
        retryTimer.current = setTimeout(() => void saveRef.current(opts), RETRY_MS);
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
    [note.id],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Metadata changes autosave as well.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    markChanged();
  }, [title, noteType, eventDate, sermon, markChanged]);

  // Warn before leaving with unsaved text; save when the tab is hidden.
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

  async function keepCopy() {
    const ed = editorRef.current;
    if (!ed) return;
    const res = await fetch("/api/v1/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${meta.current.title || "Naamloos"} (conflictkopie)`.slice(0, 200),
        noteType: meta.current.noteType,
        eventDate: meta.current.eventDate || null,
        document: ed.getJSON(),
      }),
    });
    if (res.ok) {
      changes.current = saved.current; // nothing unsaved any more: it lives in the copy
      const copy = (await res.json()) as { id: string };
      router.push(`/notes/${copy.id}`);
    } else {
      setMessage("De kopie kon niet worden bewaard. Kopieer je tekst handmatig voordat je verdergaat.");
    }
  }

  return (
    <div className="note-editor">
      <div className="note-meta">
        <div className="field note-title">
          <label htmlFor={`${ids}-title`}>Titel</label>
          <input id={`${ids}-title`} type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Naamloze notitie" />
        </div>
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
          <label htmlFor={`${ids}-date`}>Datum</label>
          <input id={`${ids}-date`} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
      </div>

      {noteType === "preek" && (
        <fieldset className="sermon-fields">
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

      <div className="note-status-row">
        <span className={`badge ${status}`}>{status === "afgerond" ? "Afgerond" : "Concept"}</span>
        <span className={`save-state ${saveState}`} role="status" aria-live="polite">
          {STATE_TEXT[saveState]}
        </span>
        {revision > 0 && (
          <Link href={`/notes/${note.id}/versies`} className="muted-link">
            {revision} {revision === 1 ? "versie" : "versies"}
          </Link>
        )}
      </div>

      {saveState === "conflict" && (
        <div className="alert error" role="alert">
          <p>
            Deze notitie is intussen ergens anders gewijzigd (bijvoorbeeld in een ander tabblad). Je tekst hier is
            <strong> niet</strong> overschreven en ook niet opgeslagen.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={keepCopy}>
              Bewaar mijn tekst als conflictkopie
            </button>
            <button type="button" className="button secondary" onClick={() => window.location.reload()}>
              Nieuwste versie laden (mijn wijzigingen hier vervallen)
            </button>
          </div>
        </div>
      )}

      {foundBlock && (
        <style>{`.note-body [data-block-id="${foundBlock}"] { animation: found 6s ease-out; border-radius: 4px; }`}</style>
      )}
      {editor && <Toolbar editor={editor} books={books} defaultTranslation={defaultTranslation} />}
      <EditorContent editor={editor} className="note-content" />

      {message && <p className="copy-status">{message}</p>}
      <div className="button-row note-actions">
        <button type="button" className="button secondary" disabled={saveState === "conflict"} onClick={() => void save({ reason: "handmatig" })}>
          Opslaan als versie
        </button>
        {status === "concept" ? (
          <button type="button" className="button" disabled={saveState === "conflict"} onClick={() => void save({ reason: "afronden", status: "afgerond" })}>
            Afronden
          </button>
        ) : (
          <button type="button" className="button secondary" disabled={saveState === "conflict"} onClick={() => void save({ status: "concept" })}>
            Terugzetten naar concept
          </button>
        )}
      </div>
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
    }),
  });

  const btn = (label: string, active: boolean, run: () => void, text: string) => (
    <button type="button" className="tool" aria-pressed={active} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {text}
    </button>
  );

  function insertReference(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseReference(ref, books);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError("");
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

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label="Opmaak">
        {btn("Vet", s.bold, () => editor.chain().focus().toggleBold().run(), "B")}
        {btn("Cursief", s.italic, () => editor.chain().focus().toggleItalic().run(), "I")}
        {btn("Kop", s.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
        {btn("Subkop", s.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
        {btn("Opsomming", s.bullet, () => editor.chain().focus().toggleBulletList().run(), "•")}
        {btn("Genummerde lijst", s.ordered, () => editor.chain().focus().toggleOrderedList().run(), "1.")}
        {btn("Citaat", s.quote, () => editor.chain().focus().toggleBlockquote().run(), "❝")}
      </div>
      <form className="ref-form" onSubmit={insertReference}>
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
        {error && (
          <p id={`${id}-referr`} className="field-error">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
