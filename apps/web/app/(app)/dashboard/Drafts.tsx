import { NOTE_TYPE_LABELS, type NoteType } from "@bk/schemas";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { snoozeDrafts } from "./welcome-actions";

export type Draft = { id: string; title: string; noteType: NoteType; createdAt: string };

const dayFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

/**
 * Ronde 4 (A3): concepts from the last 14 days, oldest first, so a quick note from Sunday is
 * worked out instead of sinking in the list. "Later" puts the card aside for three days.
 */
export function Drafts({ drafts, total }: { drafts: Draft[]; total: number }) {
  return (
    <section className="panel drafts-card" aria-labelledby="dash-drafts">
      <div className="panel-head">
        <h2 id="dash-drafts">Nog uitwerken</h2>
        <Link href="/notes?status=concept">Alle concepten</Link>
      </div>
      <p className="hint">
        {total === 1 ? "1 aantekening van de afgelopen twee weken wacht" : `${total} aantekeningen van de afgelopen twee weken wachten`} op uitwerken.
      </p>
      <ul className="note-list drafts-list">
        {drafts.map((d) => (
          <li key={d.id}>
            <Link href={`/notes/${d.id}`} className="recent-row">
              <span className="recent-main">
                <span className="note-list-title">{d.title || "Naamloze notitie"}</span>
                <span className="note-list-meta">
                  {NOTE_TYPE_LABELS[d.noteType]} · {dayFmt.format(new Date(d.createdAt))}
                </span>
              </span>
              <span className="drafts-cta" aria-hidden="true">Uitwerken</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={snoozeDrafts} className="drafts-later">
        <SubmitButton className="button small ghost" pendingText="Even weg…">Later</SubmitButton>
        <span className="hint">De kaart komt over drie dagen terug.</span>
      </form>
    </section>
  );
}
