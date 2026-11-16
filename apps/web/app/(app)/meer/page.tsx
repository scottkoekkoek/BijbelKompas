import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/sync/LogoutButton";

export const metadata: Metadata = { title: "Meer" };

export default function MorePage() {
  return (
    <>
      <h1>Meer</h1>
      <ul className="nav-list">
        <li><Link className="nav-link" href="/templates">Sjablonen</Link></li>
        <li><Link className="nav-link" href="/settings">Instellingen</Link></li>
        <li><Link className="nav-link" href="/sync">Offline en synchronisatie</Link></li>
      </ul>
      <div style={{ marginTop: 24 }}>
        <LogoutButton />
      </div>
    </>
  );
}
