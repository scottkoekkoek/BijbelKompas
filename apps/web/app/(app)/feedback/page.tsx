import type { Metadata } from "next";
import { FeedbackForm } from "./FeedbackForm";

export const metadata: Metadata = { title: "Feedback" };

/** Ronde 4 (V9): a tester tells what works and what doesn't, from inside the app. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ van?: string }> }) {
  const { van } = await searchParams;
  const from = typeof van === "string" && /^\/[^\s]{0,299}$/.test(van) ? van : null;
  return (
    <>
      <h1>Feedback</h1>
      <p className="page-intro">
        Je test BijbelKompas mee: fijn! Schrijf hier wat goed werkte, wat onduidelijk was of wat je miste. Korte
        zinnen zijn genoeg. De beheerder van de pilot leest het; andere testers zien het niet.
      </p>
      <FeedbackForm from={from} />
    </>
  );
}
