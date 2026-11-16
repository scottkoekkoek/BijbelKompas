import type { Metadata } from "next";
import Link from "next/link";
import { readerPath } from "@/lib/bible";
import { getReadingPosition } from "@/lib/bible-data";
import { NewNoteButton } from "@/components/notes/NewNoteButton";
import { listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const [position, notes] = await Promise.all([getReadingPosition(supabase), listNotes(supabase)]);
  const recent = notes.slice(0, 5);

  return (
    <>
      <h1>Welkom</h1>
      <p className="page-intro">Lees verder in de Bijbel of ga verder met je notities.</p>
      <section className="card">
        <h2>Bijbel lezen</h2>
        {position ? (
          <p>
            <Link className="button" href={readerPath(position.bookCode, position.chapter, position.translation)}>
              Verder lezen: {position.bookName} {position.chapter}
            </Link>
          </p>
        ) : (
          <p>
            <Link className="button" href="/bible">
              Begin met lezen
            </Link>
          </p>
        )}
      </section>
      <section className="card">
        <h2>Recente notities</h2>
        {recent.length === 0 ? (
          <p>Je hebt nog geen notities.</p>
        ) : (
          <ul className="recent-notes">
            {recent.map((n) => (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`}>{n.title || "Naamloze notitie"}</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="button-row">
          <NewNoteButton />
          <Link className="button secondary" href="/notes">
            Alle notities
          </Link>
        </p>
      </section>
    </>
  );
}
