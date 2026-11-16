import { NOTE_TYPE_LABELS, NoteStatus, NoteType } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { getBooks } from "@/lib/bible-data";
import { listCollections, timeline } from "@/lib/collections/data";
import { buildTree, flatten, groupByYear } from "@/lib/collections/tree";
import { getSermonSuggestions } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tijdlijn" };

type Props = {
  searchParams: Promise<{ van?: string; tot?: string; type?: string; status?: string; spreker?: string; boek?: string; collectie?: string }>;
};

const Day = z.iso.date();
const long = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const short = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const day = (iso: string) => long.format(new Date(`${iso}T12:00:00`));

/**
 * BK-052/053: notes in the order of what they are about (the event date), newest first. When and
 * how recently something was written is shown apart from that, so the two are never confused.
 */
export default async function TimelinePage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [books, collections, suggestions] = await Promise.all([getBooks(supabase), listCollections(supabase), getSermonSuggestions(supabase)]);
  const f = {
    from: Day.safeParse(sp.van).data,
    to: Day.safeParse(sp.tot).data,
    type: NoteType.safeParse(sp.type).data,
    status: NoteStatus.safeParse(sp.status).data,
    speaker: sp.spreker?.trim().slice(0, 100) || undefined,
    book: books.find((b) => b.code === sp.boek)?.code,
    collection: collections.find((c) => c.id === sp.collectie)?.id,
  };
  const entries = await timeline(supabase, f);
  const groups = groupByYear(entries);
  const filtered = Object.values(f).some(Boolean);
  const tree = flatten(buildTree(collections));
  const themes = tree.filter((c) => c.collectionType === "thema");
  const others = tree.filter((c) => c.collectionType !== "thema");

  return (
    <>
      <div className="page-head">
        <h1>Tijdlijn</h1>
      </div>
      <p className="page-intro">
        Je notities op volgorde van de datum waar ze over gaan, zoals de dag van de preek. Wanneer je iets schreef en
        bijwerkte, staat er apart bij.
      </p>

      <form className="timeline-filters" method="get" role="search" aria-label="Tijdlijn filteren">
        <div className="field">
          <label htmlFor="van">Vanaf</label>
          <input id="van" name="van" type="date" defaultValue={f.from ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="tot">Tot en met</label>
          <input id="tot" name="tot" type="date" defaultValue={f.to ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="type">Soort</label>
          <select id="type" name="type" defaultValue={f.type ?? ""}>
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
          <select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">Alles</option>
            <option value="concept">Concept</option>
            <option value="afgerond">Afgerond</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="spreker">Spreker</label>
          <input id="spreker" name="spreker" type="text" list="sprekers" defaultValue={f.speaker ?? ""} />
          <datalist id="sprekers">
            {suggestions.speakers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="boek">Bijbelboek</label>
          <select id="boek" name="boek" defaultValue={f.book ?? ""}>
            <option value="">Alle boeken</option>
            {books.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="collectie">Thema of collectie</label>
          <select id="collectie" name="collectie" defaultValue={f.collection ?? ""}>
            <option value="">Alles</option>
            {themes.length > 0 && (
              <optgroup label="Thema's">
                {themes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Collecties">
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"  ".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="button-row">
          <button type="submit" className="button secondary">
            Filter
          </button>
          {filtered && <Link href="/timeline">Filters wissen</Link>}
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="placeholder">{filtered ? "Geen notities gevonden met dit filter." : "Je hebt nog geen notities."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.year} aria-labelledby={`jaar-${g.year}`} className="timeline-year">
            <h2 id={`jaar-${g.year}`}>{g.year}</h2>
            <ol className="timeline">
              {g.items.map((e) => (
                <li key={e.id}>
                  <p className="timeline-date">
                    {e.hasEventDate ? <time dateTime={e.date}>{day(e.date)}</time> : <span className="muted">Geen datum</span>}
                  </p>
                  <Link href={`/notes/${e.id}`} className="note-list-title">
                    {e.title || "Naamloze notitie"}
                  </Link>
                  <p className="note-list-meta">
                    {NOTE_TYPE_LABELS[e.noteType]}
                    {e.speaker && <> · {e.speaker}</>} ·{" "}
                    <span className={`badge ${e.status}`}>{e.status === "afgerond" ? "Afgerond" : "Concept"}</span>
                  </p>
                  <p className="timeline-written">
                    Geschreven op <time dateTime={e.createdAt}>{short.format(new Date(e.createdAt))}</time>
                    {e.updatedAt.slice(0, 10) !== e.createdAt.slice(0, 10) && (
                      <>
                        , bijgewerkt op <time dateTime={e.updatedAt}>{short.format(new Date(e.updatedAt))}</time>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </>
  );
}
