"use client";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <html lang="nl">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px", background: "#f7f3eb", color: "#243d35", fontFamily: "system-ui, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 460, background: "#fffdf8", border: "1px solid #e7e1d5", borderRadius: 10, padding: 24 }}>
          <title>Er ging iets mis · BijbelKompas</title>
          <h1 style={{ fontSize: "1.4rem", marginTop: 0 }}>Er ging iets mis</h1>
          <p>BijbelKompas kon niet worden geladen. Je gegevens zijn niet aangepast.</p>
          <button type="button" onClick={() => retry()} style={{ font: "inherit", fontWeight: 600, padding: "10px 18px", minHeight: 44, borderRadius: 8, border: "1px solid #355d53", background: "#355d53", color: "#fff", cursor: "pointer" }}>
            Opnieuw proberen
          </button>
          {digest && <p style={{ color: "#5b6b64", fontSize: "0.9rem" }}>Foutcode: {digest}</p>}
        </main>
      </body>
    </html>
  );
}
