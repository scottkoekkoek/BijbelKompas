import Link from "next/link";
import { BrandMark } from "./icons";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="card">
        <Link href="/login" className="brand">
          <BrandMark />
          BijbelKompas
        </Link>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
