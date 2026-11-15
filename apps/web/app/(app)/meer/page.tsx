import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Meer" };

export default function MorePage() {
  return (
    <>
      <h1>Meer</h1>
      <ul className="nav-list">
        <li><Link className="nav-link" href="/settings">Instellingen</Link></li>
      </ul>
      <form action={signOut} style={{ marginTop: 24 }}>
        <button type="submit" className="button secondary">Uitloggen</button>
      </form>
    </>
  );
}
