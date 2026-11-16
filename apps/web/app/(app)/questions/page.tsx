import { QUESTION_STATUS_LABELS, QuestionStatus } from "@bk/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { NewQuestionForm } from "@/components/questions/NewQuestionForm";
import { listQuestions } from "@/lib/collections/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Onderzoeksvragen" };

type Props = { searchParams: Promise<{ status?: string }> };
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

/** BK-049: research questions you want to work out, with their status. */
export default async function QuestionsPage({ searchParams }: Props) {
  const status = QuestionStatus.safeParse((await searchParams).status).data;
  const supabase = await createClient();
  const questions = await listQuestions(supabase, status);
  const tabs: { href: string; label: string; current: boolean }[] = [
    { href: "/questions", label: "Lopend", current: !status },
    ...QuestionStatus.options.map((s) => ({ href: `/questions?status=${s}`, label: QUESTION_STATUS_LABELS[s], current: status === s })),
  ];

  return (
    <>
      <div className="page-head">
        <h1>Onderzoeksvragen</h1>
      </div>
      <p className="page-intro">
        Vragen die je wilt uitzoeken. Koppel er Bijbelgedeelten en notities aan, en schrijf zelf je antwoord op als je
        zover bent. Alleen jij zet een vraag op beantwoord.
      </p>
      <details className="new-collection">
        <summary className="button">Nieuwe vraag</summary>
        <NewQuestionForm />
      </details>

      <nav aria-label="Vragen per status" className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {questions.length === 0 ? (
        <p className="placeholder">{status ? "Geen vragen met deze status." : "Je hebt nog geen open vragen."}</p>
      ) : (
        <ul className="note-list">
          {questions.map((q) => (
            <li key={q.id}>
              <Link href={`/questions/${q.id}`}>
                <span className="note-list-title">{q.title}</span>
                <span className="note-list-meta">
                  <span className={`badge q-${q.status}`}>{QUESTION_STATUS_LABELS[q.status]}</span> · gesteld op{" "}
                  {dateFmt.format(new Date(q.createdAt))}
                  {q.resolvedAt && <> · beantwoord op {dateFmt.format(new Date(q.resolvedAt))}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
