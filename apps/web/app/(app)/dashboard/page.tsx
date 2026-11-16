import type { Metadata } from "next";
import Link from "next/link";
import { readerPath } from "@/lib/bible";
import { getReadingPosition } from "@/lib/bible-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const position = await getReadingPosition(supabase);

  return (
    <>
      <h1>Welkom</h1>
      <p className="page-intro">Hier verschijnen straks ook je recente notities en open vragen.</p>
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
      <p className="placeholder">Notities komen in de volgende sprint.</p>
    </>
  );
}
