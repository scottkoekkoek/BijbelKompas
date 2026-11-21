"use client";
/**
 * ADR-017: AI-uitleg bij geselecteerde verzen. Only shown when AI is on, a provider is set and the
 * translation may be processed by AI (the Statenvertaling; never HSV/NBV21). The explanation is
 * derived help: it never changes a note, and cross-references are suggestions to look up yourself.
 */
import Link from "next/link";
import { useState } from "react";

type Explanation = { id: string; label: string; text: string; crossReferences: { reference: string; reason: string }[]; model: string };
type Props = {
  passage: { translation: string; book: string; chapter: number; from: number; to: number };
  provider: { name: string; external: boolean };
};

export function ExplainVerses({ passage, provider }: Props) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function explain() {
    setBusy(true);
    setStatus("Uitleg wordt gemaakt…");
    try {
      const res = await fetch("/api/v1/ai/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passage),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(body?.error?.message ?? "De uitleg is niet gelukt.");
        return;
      }
      setExplanation(body.explanation as Explanation);
      setStatus(body.reused ? "Deze uitleg is al eens gemaakt; er is niets opnieuw betaald." : "Uitleg ontvangen.");
    } catch {
      setStatus("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-explain" aria-label="AI-uitleg bij deze verzen">
      {!explanation && (
        <button type="button" className="button secondary" onClick={() => void explain()} disabled={busy} aria-describedby="uitleg-hint">
          Uitleg (AI)
        </button>
      )}
      {!explanation && (
        <p id="uitleg-hint" className="hint">
          {provider.external ? `Stuurt alleen de tekst van deze verzen naar ${provider.name}, niets uit je notities.` : "Testaanbieder: er gaat niets naar buiten."}
        </p>
      )}
      <p role="status" className="muted">
        {status}
      </p>
      {explanation && (
        <div className="card ai-answer">
          <h2>Uitleg bij {explanation.label}</h2>
          {explanation.text.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {explanation.crossReferences.length > 0 && (
            <>
              <h3>Om verder te lezen</h3>
              <ul className="ai-sources">
                {explanation.crossReferences.map((c) => (
                  <li key={c.reference}>
                    <Link href={`/search?q=${encodeURIComponent(c.reference)}`}>{c.reference}</Link>
                    {c.reason && <span className="muted"> · {c.reason}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="hint">AI-uitleg ({explanation.model}). Dit is hulp bij je studie, geen gezaghebbende uitleg: controleer het zelf.</p>
        </div>
      )}
    </section>
  );
}
