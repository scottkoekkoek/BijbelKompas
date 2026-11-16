import type { Metadata } from "next";
import Link from "next/link";
import { ImportExport } from "@/components/settings/ImportExport";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fromRow, PREFERENCE_COLUMNS, type PreferencesRow } from "@/lib/preferences";
import { PreferencesForm } from "./PreferencesForm";

export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [prefs, translations] = await Promise.all([
    supabase.from("user_preferences").select(PREFERENCE_COLUMNS).eq("user_id", auth.user.id).single(),
    supabase.from("bible_translations").select("id, name, rights_status").order("name"),
  ]);
  if (prefs.error || !prefs.data) throw new Error("Voorkeuren konden niet worden geladen.");

  return (
    <>
      <h1>Instellingen</h1>
      <p className="page-intro">Ingelogd als {auth.user.email}</p>
      <PreferencesForm initial={fromRow(prefs.data as PreferencesRow)} translations={translations.data ?? []} />

      <section className="settings-section" aria-labelledby="export-heading">
        <h2 id="export-heading">Je gegevens exporteren</h2>
        <p className="page-intro">
          Download al je notities, Bijbelkoppelingen, versies, collecties, vragen, sjablonen en voorkeuren in één zip-bestand: een volledig
          JSON-bestand en elke notitie als leesbaar Markdown-bestand. Bewaar het op een veilige plek.
        </p>
        <a className="button secondary" href="/api/v1/export" download>
          Alles exporteren
        </a>
      </section>

      <section className="settings-section" aria-labelledby="import-heading">
        <h2 id="import-heading">Export terugzetten</h2>
        <p className="page-intro">
          Zet een eerdere export terug, bijvoorbeeld na een verhuizing naar een nieuw account. Er wordt alleen
          toegevoegd: wat al in je account staat, blijft precies zoals het is.
        </p>
        <ImportExport />
      </section>

      <section className="settings-section" aria-labelledby="offline-heading">
        <h2 id="offline-heading">Offline en synchronisatie</h2>
        <p className="page-intro">Zie wat er op dit apparaat staat en wat nog verstuurd moet worden.</p>
        <Link className="button secondary" href="/sync">Offline en synchronisatie</Link>
      </section>
    </>
  );
}
