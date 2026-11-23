import { NOTE_TYPE_LABELS, NoteStatus, NoteType } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { NoteIcon, TrashIcon } from "@/components/icons";
import { TrashButton } from "@/components/notes/TrashButton";
import { getNote, listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notities" };

type Props = { searchParams: Promise<{ q?: string; type?: string; status?: string; archief?: string; prullenbak?: string; weggegooid?: string }> };

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export default async function NotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const type = NoteType.safeParse(sp.type).data;
  const status = NoteStatus.safeParse(sp.status).data;
  const trash = sp.prullenbak === "1";
  const archived = !trash && sp.archief === "1";
  const q = (sp.q ?? "").slice(0, 100);
  const supabase = await createClient();
  const thrown = /^[0-9a-f-]{36}$/.test(sp.weggegooid ?? "") ? sp.weggegooid! : null;
  const [notes, thrownNote] = await Promise.all([
    listNotes(supabase, { q: q || undefined, type, status: trash ? undefined : status, archived, trash }),
    thrown ? getNote(supabase, thrown).catch(() => null) : Promise.resolve(null),
  ]);
  const filtered = Boolean(q || type || (!trash && status));
  const heading = trash ? "Prullenbak" : archived ? "Archief" : "Notities";

  return (
    <>
      <div className="page-head">
        <h1>{heading}</h1>
        {!archived && !trash && (
          <Link className="button" href="/notes/new">
            <NoteIcon size={18} />
            Nieuwe notitie
          </Link>
        )}
      </div>

      {/* just thrown away: undo right here (Ronde 3 §3) */}
      {thrownNote?.trashed && (
        <div className="alert ok undo-bar" role="status">
          <span>“{thrownNote.title || "Naamloze notitie"}” staat in de prullenbak.</span>
          <TrashButton id={thrownNote.id} title={thrownNote.title} mode="ongedaan" after={`/notes/${thrownNote.id}`} />
        </div>
      )}
      {trash && (
        <p className="page-intro">
          Hier staan concepten die je hebt verwijderd. Ze tellen nergens meer mee, maar tekst, versies en koppelingen zijn bewaard. Zet een
          concept terug om er verder aan te werken.
        </p>
      )}

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
        {trash && <input type="hidden" name="prullenbak" value="1" />}
        <button type="submit" className="button secondary">
          Filter
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="placeholder">
          {filtered
            ? "Geen notities gevonden met dit filter."
            : trash
              ? "De prullenbak is leeg."
              : archived
              ? "Er staan geen notities in het archief."
              : "Je hebt nog geen notities. Begin met een nieuwe notitie, of selecteer verzen in de Bijbel en kies “In notitie zetten”."}
        </p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={n.status === "concept" ? "has-action" : undefined}>
              <Link href={`/notes/${n.id}`}>
                <span className="note-list-title">{n.title || "Naamloze notitie"}</span>
                <span className="note-list-meta">
                  {NOTE_TYPE_LABELS[n.noteType]} · <span className={`badge ${n.status}`}>{n.status === "afgerond" ? "Afgerond" : "Concept"}</span>
                  {n.eventDate && <> · {dateFmt.format(new Date(n.eventDate))}</>}
                </span>
              </Link>
              {n.status === "concept" && (
                <span className="note-list-action">
                  <TrashButton id={n.id} title={n.title} mode={trash ? "terugzetten" : "weggooien"} compact={!trash} after={trash ? undefined : `/notes?weggegooid=${n.id}`} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="list-footer-links">
        {archived || trash ? (
          <Link href="/notes">Terug naar notities</Link>
        ) : (
          <>
            <Link href="/notes?archief=1">Archief bekijken</Link>
            <Link href="/notes?prullenbak=1">
              <TrashIcon size={16} /> Prullenbak
            </Link>
          </>
        )}
      </p>
    </>
  );
}
