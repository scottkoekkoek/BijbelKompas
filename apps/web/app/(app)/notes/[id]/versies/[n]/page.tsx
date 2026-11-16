import { NOTE_TYPE_LABELS, REVISION_REASON_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentView } from "@/components/notes/DocumentView";
import { RestoreButton } from "@/components/notes/RestoreButton";
import { getNote, getRevision } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Versie" };
const fmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" });

export default async function VersionPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const p = await params;
  const id = z.uuid().safeParse(p.id);
  const n = z.coerce.number().int().min(1).safeParse(p.n);
  if (!id.success || !n.success) notFound();
  const supabase = await createClient();
  const [note, rev] = await Promise.all([getNote(supabase, id.data), getRevision(supabase, id.data, n.data)]);
  if (!note || !rev) notFound();

  return (
    <article className="note-page">
      <p className="crumb">
        <Link href={`/notes/${note.id}`}>{note.title || "Naamloze notitie"}</Link> ·{" "}
        <Link href={`/notes/${note.id}/versies`}>Versiegeschiedenis</Link>
      </p>
      <h1>
        Versie {rev.revisionNumber}: {rev.meta.title || "Naamloze notitie"}
      </h1>
      <p className="page-intro">
        {REVISION_REASON_LABELS[rev.reason]} · {fmt.format(new Date(rev.createdAt))} · {NOTE_TYPE_LABELS[rev.meta.note_type]}
      </p>
      <DocumentView doc={rev.document} />
      <div className="button-row">
        {rev.revisionNumber !== note.currentRevision && (
          <RestoreButton id={note.id} n={rev.revisionNumber} baseVersion={note.documentVersion} />
        )}
        <Link className="button secondary" href={`/notes/${note.id}`}>
          Terug naar de notitie
        </Link>
      </div>
    </article>
  );
}
