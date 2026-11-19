"use client";
/**
 * BK-042 / BK-043 / AT-11: ask a question to your own notes. Every source is a literal quote from
 * one of your notes and opens at that paragraph. Without a checked source the answer says so,
 * and nothing is made up. Only shown when AI is on and a provider is set.
 */
import Link from "next/link";
import { useState } from "react";

type Source = { noteId: string; blockId: string; title: string; quote: string; revision: number; changed: boolean };
type Answer = { id: string; question: string; text: string; uncertain: boolean; model: string; sources: Source[] };
type Props = { initialQuestion: string; provider: { name: string; external: boolean } };

export function AskNotes({ initialQuestion, provider }: Props) {
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 2) return setStatus("Stel een vraag van minstens twee tekens.");
    setBusy(true);
    setStatus("Bezig met zoeken in je notities…");
    try {
      const res = await fetch("/api/v1/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(body?.error?.message ?? "De vraag kon niet worden beantwoord.");
        return;
      }
      setAnswer(body.answer as Answer);
      setStatus(body.reused ? "Deze vraag is al eens beantwoord; er is niets opnieuw betaald." : "Antwoord ontvangen.");
    } catch {
      setStatus("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ask-notes" aria-labelledby="ask-title">
      <h2 id="ask-title">Vraag het je notities</h2>
      <form onSubmit={(e) => void ask(e)} className="search-bar">
        <label htmlFor="vraag" className="visually-hidden">
          Je vraag
        </label>
        <input id="vraag" type="text" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Bijvoorbeeld: wat schreef ik over genade?" />
        <button type="submit" className="button secondary" disabled={busy}>
          Vraag stellen
        </button>
      </form>
      <p className="hint">
        {provider.external
          ? `Stuurt alleen de alinea's uit je notities die bij de vraag passen naar ${provider.name}.`
          : "Testaanbieder: er gaat niets naar buiten."}
      </p>
      <p role="status" className="muted">
        {status}
      </p>
      {answer && (
        <div className="card ai-answer">
          {answer.uncertain && <p className="badge">Onzeker</p>}
          <p>{answer.text}</p>
          {answer.sources.length > 0 ? (
            <>
              <h3>Bronnen</h3>
              <ol className="ai-sources">
                {answer.sources.map((s) => (
                  <li key={`${s.noteId}/${s.blockId}`}>
                    <Link href={`/notes/${s.noteId}#blok-${s.blockId}`}>{s.title}</Link>
                    <blockquote>{s.quote}</blockquote>
                    {s.changed && <p className="muted">Deze alinea is gewijzigd sinds het antwoord (versie {s.revision}).</p>}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted">Geen bron gevonden. Er is niets verzonnen.</p>
          )}
          <p className="muted">Gemaakt door {answer.model}. Controleer het antwoord altijd met de bronnen.</p>
        </div>
      )}
    </section>
  );
}
