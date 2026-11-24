import Link from "next/link";
import { markPlanDay } from "@/app/(app)/leesplan/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { readerPath } from "@/lib/bible";
import { segmentLabel, type Segment } from "@/lib/reading/plans";

type Plan = { name: string; total: number; daysDone: number; next: { day: number; segments: Segment[] } | null; behind: number; done: boolean };

/** Ronde 4 (C2): the next portion of your reading plan. Behind is fine: you just read on from here. */
export function PlanToday({ plan, translation, compact = false }: { plan: Plan; translation?: string; compact?: boolean }) {
  return (
    <section className="panel plan-today" aria-labelledby="plan-today-h">
      <div className="panel-head">
        <h2 id="plan-today-h">{plan.done ? "Leesplan uitgelezen" : "Vandaag lezen"}</h2>
        {compact && <Link href="/leesplan">Leesplan</Link>}
      </div>
      {plan.next ? (
        <>
          <p className="plan-portion">
            {plan.next.segments.map((s, i) => (
              <span key={s.book}>
                {i > 0 && ", "}
                <Link href={readerPath(s.book, s.from, translation)}>{segmentLabel(s)}</Link>
              </span>
            ))}
          </p>
          <p className="hint">
            {plan.name}, dag {plan.next.day} van {plan.total}.
            {plan.behind > 0 && ` Je leest in je eigen tempo; het plan wacht op je.`}
          </p>
          <form action={markPlanDay}>
            <input type="hidden" name="day" value={plan.next.day} />
            <SubmitButton className="button small secondary" pendingText="Bewaren…">Gelezen</SubmitButton>
          </form>
        </>
      ) : (
        <p className="hint">Je hebt “{plan.name}” uitgelezen. Kies een nieuw plan wanneer je wilt.</p>
      )}
      <meter className="ai-meter" min={0} max={plan.total} value={plan.daysDone} aria-label="Voortgang van het leesplan">
        {plan.daysDone} van {plan.total}
      </meter>
    </section>
  );
}
