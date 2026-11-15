import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Home" };

export default function DashboardPage() {
  return (
    <>
      <h1>Welkom</h1>
      <p className="page-intro">Hier verschijnen straks je recente notities, je leespositie en open vragen.</p>
      <div className="placeholder">
        <p>De Bijbellezer en notities komen in de volgende sprint.</p>
        <p>
          Je kunt nu al je <Link href="/settings">voorkeuren</Link> instellen.
        </p>
      </div>
    </>
  );
}
