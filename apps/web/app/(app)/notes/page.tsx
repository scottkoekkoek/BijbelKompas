import { NOTE_TYPE_LABELS, NoteStatus, NoteType } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { NewNoteButton } from "@/components/notes/NewNoteButton";
import { listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notities" };

type Props = { searchParams: Promise<{ q?: string; type?: string; status?: string; archief?: string }> };

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export default async function NotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const type = NoteType.safeParse(sp.type).data;
  const status = NoteStatus.safeParse(sp.status).data;
  const archived = sp.archief === "1";
  const q = (sp.q ?? "").slice(0, 100);
  const supabase = await createClient();
  const notes = await listNotes(supabase, { q: q || undefined, type, status, archived });
  const filtered = Boolean(q || type || status);

  return (
    <>
      <div className="page-head">
        <h1>{archived ? "Archief" : "Notities"}</h1>
        {!archived && <NewNoteButton />}
      </div>

      <form className="filters" method="get" role="search" aria-label="Notities filteren">
        <div className="field">
          <label htmlFor="q">Zoek op titel</label>
          <input id="q" name="q" type="text" defaultValue={q} />
        </div>
        <div className="field">
          <label htmlFor="type">Soort</label>
          <select id="type" name="type" defaultValue={type ?? ""}>
            <option value="">Alle soorten</option>
            {NoteType.options.map((t) => (
              <option key={t} value={t}>
                {NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Alles</option>
            <option value="concept">Concept</option>
            <option value="afgerond">Afgerond</option>
          </select>
        </div>
        {archived && <input type="hidden" name="archief" value="1" />}
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="placeholder">
          {filtered
            ? "Geen notities gevonden met dit filter."
            : archived
              ? "Er staan geen notities in het archief."
              : "Je hebt nog geen notities. Begin met een nieuwe notitie, of selecteer verzen in de Bijbel en kies “In notitie zetten”."}
        </p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`/notes/${n.id}`}>
                <span className="note-list-title">{n.title || "Naamloze notitie"}</span>
                <span className="note-list-meta">
                  {NOTE_TYPE_LABELS[n.noteType]} · <span className={`badge ${n.status}`}>{n.status === "afgerond" ? "Afgerond" : "Concept"}</span>
                  {n.eventDate && <> · {dateFmt.format(new Date(n.eventDate))}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p>
        {archived ? <Link href="/notes">Terug naar notities</Link> : <Link href="/notes?archief=1">Archief bekijken</Link>}
      </p>
    </>
  );
}
