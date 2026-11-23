// Feature 4 → Ronde 3 §2: a finished note now opens in the reading view at /notes/<id> itself.
// This address keeps working: a finished sermon goes there; a draft or another type still gets
// the explanation it always had.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getNote } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Preekweergave" };

export default async function SermonPage({ params }: Props) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const note = await getNote(await createClient(), id.data);
  if (!note) notFound();
  const notePath = `/notes/${note.id}`;
  if (note.status === "afgerond") redirect(notePath);

  return (
    <article className="sermon-blocked">
      <p className="crumb">
        <Link href={notePath}>Terug naar notitie</Link>
      </p>
      <h1>Preekweergave</h1>
      <p className="alert info">
        {note.noteType !== "preek"
          ? "De preekweergave is er alleen voor notities van het type Preek."
          : "De preekweergave opent zodra de preek is afgerond. Rond de notitie eerst af in de editor."}
      </p>
    </article>
  );
}
