import { NOTE_TYPE_LABELS, NoteStatus, NoteType } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { AskNotes } from "@/components/ai/AskNotes";
import { Highlight } from "@/components/Highlight";
import { configuredProvider } from "@/lib/ai/provider";
import { readerPath } from "@/lib/bible";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { getSermonSuggestions, searchBible, searchNotes, type SearchFilters } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Zoeken" };

type Props = {
  searchParams: Promise<{ q?: string; type?: string; status?: string; van?: string; tot?: string; boek?: string; spreker?: string; archief?: string }>;
};

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined);

/** BK-034, BK-035, BK-038: keyword search in own notes (by block) and in the Bible text. No AI involved.
 *  BK-042: with AI on, a question to your notes can be asked too (separately, never automatically). */
export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const [books, translations, suggestions, prefs] = await Promise.all([
    getBooks(supabase),
    getTranslations(supabase),
    getSermonSuggestions(supabase),
    supabase.from("user_preferences").select("ai_enabled").maybeSingle(),
  ]);
  // BK-042: asking questions only with AI on and a provider set; plain search never needs AI
  const provider = prefs.data?.ai_enabled === true ? configuredProvider() : null;
  const filters: SearchFilters = {
    type: NoteType.safeParse(sp.type).data,
    status: NoteStatus.safeParse(sp.status).data,
    from: isoDate(sp.van),
    to: isoDate(sp.tot),
    book: books.find((b) => b.code === sp.boek)?.code,
    speaker: sp.spreker?.trim().slice(0, 120) || undefined,
    archived: sp.archief === "1",
  };
  const translation = pickTranslation(translations, undefined, null);
  const searching = q.length >= 2;
  const [notes, bible] = searching
    ? await Promise.all([
        searchNotes(supabase, q, filters),
        translation ? searchBible(supabase, translation.code, q) : Promise.resolve({ total: 0, hits: [] }),
      ])
    : [[], { total: 0, hits: [] }];
  const filtered = Object.entries(filters).some(([, v]) => v);

  return (
    <>
      <h1>Zoeken</h1>
      <form className="search-form" method="get" role="search" aria-label="Zoeken in notities en Bijbel">
        <div className="search-bar">
          <label htmlFor="q" className="visually-hidden">
            Zoekwoorden
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Zoek in je notities en de Bijbel" maxLength={200} />
          <button type="submit" className="button">
            Zoeken
          </button>
        </div>
        <details className="search-filters" open={filtered}>
          <summary>Filters voor notities{filtered ? " (actief)" : ""}</summary>
          <div className="filters">
            <div className="field">
              <label htmlFor="type">Soort</label>
              <select id="type" name="type" defaultValue={filters.type ?? ""}>
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
              <select id="status" name="status" defaultValue={filters.status ?? ""}>
                <option value="">Alles</option>
                <option value="concept">Concept</option>
                <option value="afgerond">Afgerond</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="van">Vanaf datum</label>
              <input id="van" name="van" type="date" defaultValue={filters.from ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="tot">Tot en met datum</label>
              <input id="tot" name="tot" type="date" defaultValue={filters.to ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="boek">Bijbelboek</label>
              <select id="boek" name="boek" defaultValue={filters.book ?? ""}>
                <option value="">Alle boeken</option>
                {books.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="spreker">Spreker</label>
              <input id="spreker" name="spreker" type="text" list="spreker-list" defaultValue={filters.speaker ?? ""} autoComplete="off" />
              <datalist id="spreker-list">
                {suggestions.speakers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <label className="check">
              <input type="checkbox" name="archief" value="1" defaultChecked={filters.archived} /> Zoek in het archief
            </label>
          </div>
        </details>
      </form>

      {provider && <AskNotes initialQuestion={q} provider={{ name: provider.name, external: provider.external }} />}

      {!searching ? (
        <p className="placeholder">Typ minstens twee letters. Je zoekt in titels en tekst van je notities en in de Bijbeltekst.</p>
      ) : (
        <>
          <section aria-labelledby="note-results">
            <h2 id="note-results">
              Notities <span className="count">({notes.length === 50 ? "50+" : notes.length})</span>
            </h2>
            {notes.length === 0 ? (
              <p className="placeholder">Geen notities gevonden{filtered ? " met deze filters" : ""}.</p>
            ) : (
              <ul className="note-list search-results">
                {notes.map((n) => (
                  <li key={n.noteId}>
                    <Link href={`/notes/${n.noteId}${n.blockId ? `#blok-${n.blockId}` : ""}`}>
                      <span className="note-list-title">{n.title || "Naamloze notitie"}</span>
                      {n.snippet && (
                        <span className="snippet">
                          <Highlight text={n.snippet} />
                        </span>
                      )}
                      <span className="note-list-meta">
                        {NOTE_TYPE_LABELS[n.noteType]} · {n.status === "afgerond" ? "Afgerond" : "Concept"}
                        {n.eventDate && <> · {dateFmt.format(new Date(n.eventDate))}</>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {translation && (
            <section aria-labelledby="bible-results">
              <h2 id="bible-results">
                Bijbel ({translation.name}) <span className="count">({bible.total})</span>
              </h2>
              {bible.hits.length === 0 ? (
                <p className="placeholder">Niets gevonden in de Bijbeltekst.</p>
              ) : (
                <>
                  <ul className="verse-results">
                    {bible.hits.map((h) => (
                      <li key={`${h.bookCode}.${h.chapter}.${h.verse}`}>
                        <Link href={`${readerPath(h.bookCode, h.chapter, translation.code)}#v${h.verse}`}>
                          {h.bookName} {h.chapter}:{h.verse}
                        </Link>{" "}
                        <span className="verse-snippet">
                          <Highlight text={h.snippet} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {bible.total > bible.hits.length && (
                    <p className="muted">
                      De eerste {bible.hits.length} van {bible.total} verzen worden getoond. Voeg een woord toe om verder te zoeken.
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
