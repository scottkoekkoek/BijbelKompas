import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bijbel" };

export default function Page() {
  return (
    <>
      <h1>Bijbel</h1>
      <p className="placeholder">De Bijbellezer met de Statenvertaling komt in Sprint 2.</p>
    </>
  );
}
