import Link from "next/link";
import { BrandMark } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="card">
        <p className="brand">
          <BrandMark />
          BijbelKompas
        </p>
        <h1>Pagina niet gevonden</h1>
        <p className="muted">Deze pagina bestaat niet (meer). Misschien is de link verouderd.</p>
        <p>
          <Link href="/dashboard" className="button">Terug naar home</Link>
        </p>
      </div>
    </main>
  );
}
