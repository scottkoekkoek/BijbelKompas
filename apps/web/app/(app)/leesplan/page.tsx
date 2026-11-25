import type { Metadata } from "next";
import { PlanToday } from "@/components/reading/PlanToday";
import { SubmitButton } from "@/components/SubmitButton";
import { getReadingPlan, getTranslations, pickTranslation } from "@/lib/bible-data";
import { PLANS } from "@/lib/reading/plans";
import { createClient } from "@/lib/supabase/server";
import { startPlan, stopPlan } from "./actions";

export const metadata: Metadata = { title: "Leesplan" };

/** Ronde 4 (C2): choose a reading plan, see where you are, or stop. No streaks, no pressure. */
export default async function PlanPage() {
  const supabase = await createClient();
  const [plan, translations] = await Promise.all([getReadingPlan(supabase), getTranslations(supabase)]);
  const translation = pickTranslation(translations, undefined, null)?.code;
  return (
    <>
      <h1>Leesplan</h1>
      <p className="page-intro">
        Een vast stuk per dag. Mis je een dag, dan is dat niet erg: het plan wacht en je leest verder waar je was. Je ziet het stuk van vandaag ook op
        Home.
      </p>
      {plan && <PlanToday plan={plan} translation={translation} />}
      <section className="settings-section" aria-labelledby="plans-h">
        <h2 id="plans-h">{plan ? "Ander plan kiezen" : "Kies een plan"}</h2>
        <ul className="plan-choices">
          {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => (
            <li key={key}>
              <form action={startPlan}>
                <input type="hidden" name="plan" value={key} />
                <span className="plan-name">{PLANS[key].name}</span>
                <span className="hint">{PLANS[key].days} dagen</span>
                <SubmitButton className="button small secondary" pendingText="Starten…">
                  {plan?.key === key ? "Opnieuw beginnen" : "Begin dit plan"}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        {plan && (
          <form action={stopPlan}>
            <SubmitButton className="button small ghost" pendingText="Stoppen…">Stoppen met het leesplan</SubmitButton>
          </form>
        )}
      </section>
    </>
  );
}
