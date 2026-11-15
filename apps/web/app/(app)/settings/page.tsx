import type { Metadata } from "next";
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
    </>
  );
}
