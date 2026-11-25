import Link from "next/link";
import { BrandMark } from "./icons";

export function AuthCard({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="auth-page">
      <div className={wide ? "card wide" : "card"}>
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
