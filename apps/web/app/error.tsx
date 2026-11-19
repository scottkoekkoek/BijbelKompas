"use client";
import Link from "next/link";
import { BrandMark } from "@/components/icons";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="auth-page">
      <div className="card" role="alert">
        <p className="brand">
          <BrandMark />
          BijbelKompas
        </p>
        <h1>Er ging iets mis</h1>
        <p className="muted">Deze pagina kon niet worden geladen. Je gegevens zijn niet aangepast.</p>
        <p className="button-row">
          <button type="button" className="button" onClick={() => retry()}>Opnieuw proberen</button>
          <Link href="/login" className="button secondary">Naar inloggen</Link>
        </p>
        {digest && <p className="hint">Foutcode: {digest}</p>}
      </div>
    </main>
  );
}
