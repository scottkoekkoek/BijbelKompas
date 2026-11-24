import { QUESTION_STATUS_LABELS } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuestionView } from "@/components/questions/QuestionView";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { getQuestion, questionLinks } from "@/lib/collections/data";
import { listNotes } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

async function load(raw: string) {
  const id = z.uuid().safeParse(raw);
  if (!id.success) return null;
  const supabase = await createClient();
  const question = await getQuestion(supabase, id.data);
  return question ? { supabase, question } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load((await params).id))?.question.title ?? "Onderzoeksvraag" };
}

export default async function QuestionPage({ params }: Props) {
  const r = await load((await params).id);
  if (!r) notFound();
  const { supabase, question } = r;
  const [links, notes, books, translations] = await Promise.all([
    questionLinks(supabase, question.id),
    listNotes(supabase, {}, 2000), // Ronde 4: every note can be picked, also old ones
    getBooks(supabase),
    getTranslations(supabase),
  ]);
  const translation = pickTranslation(translations, undefined, null);

  return (
    <article>
      <p className="crumb">
        <Link href="/questions">Onderzoeksvragen</Link>
      </p>
      <h1>{question.title}</h1>
      <p className="note-list-meta">
        <span className={`badge q-${question.status}`}>{QUESTION_STATUS_LABELS[question.status]}</span> · gesteld op{" "}
        {dateFmt.format(new Date(question.createdAt))}
        {question.resolvedAt && <> · beantwoord op {dateFmt.format(new Date(question.resolvedAt))}</>}
      </p>
      <QuestionView
        question={question}
        passages={links.passages}
        notes={links.notes}
        candidates={notes.map((n) => ({ id: n.id, title: n.title }))}
        books={books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount }))}
        translation={translation?.code ?? "SV"}
      />
    </article>
  );
}
