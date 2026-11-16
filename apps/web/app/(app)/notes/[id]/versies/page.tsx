import { REVISION_REASON_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getNote, listRevisions } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Versiegeschiedenis" };
const fmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" });

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const [note, revisions] = await Promise.all([getNote(supabase, id.data), listRevisions(supabase, id.data)]);
  if (!note) notFound();

  return (
    <>
      <p className="crumb">
        <Link href={`/notes/${note.id}`}>{note.title || "Naamloze notitie"}</Link>
      </p>
      <h1>Versiegeschiedenis</h1>
      <p className="page-intro">
        Een versie wordt bewaard als je afrondt, op “Opslaan als versie” klikt of 2 minuten niet typt. Versies veranderen
        nooit; terugzetten maakt een nieuwe versie.
      </p>
      {revisions.length === 0 ? (
        <p className="placeholder">Er zijn nog geen versies van deze notitie.</p>
      ) : (
        <ol className="note-list" reversed>
          {revisions.map((r) => (
            <li key={r.revisionNumber}>
              <Link href={`/notes/${note.id}/versies/${r.revisionNumber}`}>
                <span className="note-list-title">
                  Versie {r.revisionNumber}: {REVISION_REASON_LABELS[r.reason]}
                </span>
                <span className="note-list-meta">
                  {fmt.format(new Date(r.createdAt))} · {r.title || "Naamloze notitie"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
