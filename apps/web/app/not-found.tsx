import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="card">
        <h1>Pagina niet gevonden</h1>
        <p><Link href="/dashboard">Terug naar home</Link></p>
      </div>
    </main>
  );
}
