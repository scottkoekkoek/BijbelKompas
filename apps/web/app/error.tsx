"use client";
import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="auth-page">
      <div className="card" role="alert">
        <h1>Er ging iets mis</h1>
        <p>Deze pagina kon niet worden geladen. Je gegevens zijn niet aangepast.</p>
        <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="button" onClick={() => retry()}>Opnieuw proberen</button>
          <Link href="/login" className="button secondary">Naar inloggen</Link>
        </p>
        {digest && <p className="hint">Foutcode: {digest}</p>}
      </div>
    </main>
  );
}
