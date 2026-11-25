// Ronde 4 (B6): connections that are certain without AI. For each passage of this note: your other
// notes and your questions on the same verses. Reads only; links to search by passage for the rest.
import Link from "next/link";
import type { LinkedPassage } from "@/lib/notes/document";
import { passageStudy } from "@/lib/reader/study";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

const MAX_PASSAGES = 3;
const MAX_TITLES = 3;

export async function RelatedByPassage({ supabase, noteId, passages }: { supabase: Db; noteId: string; passages: LinkedPassage[] }) {
  const rows = (
    await Promise.all(
      passages.slice(0, MAX_PASSAGES).map(async (p) => {
        const study = await passageStudy(supabase, {
          translation: p.translation,
          book: p.book,
          chapter: p.startChapter,
          from: p.startVerse,
          to: p.endChapter > p.startChapter ? 999 : p.endVerse,
        }).catch(() => ({ notes: [], questions: [] }));
        const notes = study.notes.filter((n) => n.id !== noteId);
        return { passage: p, notes, questions: study.questions };
      }),
    )
  ).filter((r) => r.notes.length > 0 || r.questions.length > 0);
  if (rows.length === 0) return null;

  return (
    <section className="related-passages" aria-labelledby="related-h">
      <h2 id="related-h">Bij dezelfde passage</h2>
      <ul>
        {rows.map(({ passage, notes, questions }) => (
          <li key={`${passage.book}${passage.startChapter}:${passage.startVerse}`}>
            <p>
              <strong>Ook bij {passage.label}:</strong>{" "}
              <Link href={`/search?q=${encodeURIComponent(passage.label)}`}>
                {[notes.length > 0 && `${notes.length} ${notes.length === 1 ? "notitie" : "notities"}`, questions.length > 0 && `${questions.length} ${questions.length === 1 ? "vraag" : "vragen"}`]
                  .filter(Boolean)
                  .join(", ")}
              </Link>
            </p>
            {notes.length > 0 && (
              <ul className="related-titles">
                {notes.slice(0, MAX_TITLES).map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`}>{n.title || "Naamloze notitie"}</Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
