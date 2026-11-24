import type { Metadata } from "next";
import Link from "next/link";
import { listApplications } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";
import { ApplicationCard } from "./ApplicationCard";

export const metadata: Metadata = { title: "Toepassingen" };

/**
 * Ronde 4 (B4): everything you wrote under "Toepassing", so it does not sink in the archive. Open ones
 * first. Marking or looking back is stored next to the note; the note itself never changes.
 */
export default async function ApplicationsPage() {
  const supabase = await createClient();
  const items = await listApplications(supabase);
  const open = items.filter((i) => i.status === "open");
  const closed = items.filter((i) => i.status !== "open");
  return (
    <>
      <h1>Toepassingen</h1>
      <p className="page-intro">
        Wat je onder “Toepassing” schreef, uit al je notities. Vink af wat je deed, laat los wat niet meer past, en schrijf als je wilt een korte
        terugblik. Je notities zelf veranderen niet.
      </p>
      {items.length === 0 ? (
        <div className="empty-state">
          <p>Nog geen toepassingen.</p>
          <p className="hint">
            Gebruik in een notitie een kop “Toepassing”, bijvoorbeeld met het sjabloon Preek uit <Link href="/templates">Sjablonen</Link>. Wat eronder
            staat, verschijnt hier.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="open-h">
            <h2 id="open-h">Open ({open.length})</h2>
            {open.length === 0 ? <p className="hint">Alles is afgerond of losgelaten.</p> : <ul className="application-list">{open.map((i) => <ApplicationCard key={`${i.noteId}:${i.blockId}`} item={i} />)}</ul>}
          </section>
          {closed.length > 0 && (
            <section aria-labelledby="closed-h">
              <h2 id="closed-h">Gedaan of losgelaten ({closed.length})</h2>
              <ul className="application-list">{closed.map((i) => <ApplicationCard key={`${i.noteId}:${i.blockId}`} item={i} />)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
