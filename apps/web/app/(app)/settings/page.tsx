import type { Metadata } from "next";
import Link from "next/link";
import { ImportExport } from "@/components/settings/ImportExport";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fromRow, PREFERENCE_COLUMNS, type PreferencesRow } from "@/lib/preferences";
import { getBudget } from "@/lib/ai/data";
import { allowedModels, providerForUser } from "@/lib/ai/models";
import { DeleteAccount } from "./DeleteAccount";
import { PreferencesForm } from "./PreferencesForm";

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

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
  const [budget, mine] = await Promise.all([getBudget(supabase), providerForUser(supabase)]);
  const provider = mine.provider;
  const { models, defaultModel } = allowedModels();
  const ownReached = budget.usedEur >= budget.stopAtEur;
  const pilotReached = budget.pilot.usedEur >= budget.pilot.stopAtEur;
  const month = new Date(`${budget.month}T12:00:00Z`).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  return (
    <>
      <h1>Instellingen</h1>
      <p className="page-intro">Ingelogd als {auth.user.email}</p>
      <nav className="settings-nav" aria-label="Onderdelen van Instellingen">
        <a href="#weergave">Weergave</a>
        <a href="#bijbel">Bijbel</a>
        <a href="#ai-instellingen">AI</a>
        <a href="#gegevens">Gegevens</a>
        <a href="#offline">Offline</a>
      </nav>
      <PreferencesForm
        initial={fromRow(prefs.data as PreferencesRow)}
        translations={translations.data ?? []}
        ai={{ models, defaultModel, external: provider?.external ?? false, fellBack: mine.fellBack }}
      />

      <section className="settings-section" aria-labelledby="ai-budget-heading">
        <h2 id="ai-budget-heading">AI-budget</h2>
        <p>
          {month}: {eur.format(budget.usedEur)} van {eur.format(budget.limitEur)} gebruikt.
        </p>
        <meter className="ai-meter" min={0} max={budget.limitEur || 1} low={budget.stopAtEur * 0.8} high={budget.stopAtEur} optimum={0} value={budget.usedEur} aria-label="AI-budget gebruikt deze maand">
          {eur.format(budget.usedEur)}
        </meter>
        {!budget.enabled ? (
          <p className="alert info">AI staat uit voor jouw account. Er wordt niets verstuurd en er gaat niets van je budget af.</p>
        ) : ownReached ? (
          <p className="alert warn">Je AI-budget van deze maand is op. Zoeken, lezen en schrijven werken gewoon door; AI kan weer vanaf de eerste van de volgende maand.</p>
        ) : pilotReached ? (
          <p className="alert warn">Het gezamenlijke AI-budget van de pilot is deze maand op. Zoeken, lezen en schrijven werken gewoon door.</p>
        ) : null}
        <p className="page-intro">
          Nieuwe AI-taken stoppen bij {eur.format(budget.stopAtEur)}, zodat de maand onder de {eur.format(budget.limitEur)} blijft.
          {" "}Het budget telt per maand, welk model je ook kiest. Daarnaast is er een gezamenlijk pilotbudget voor alle accounts
          samen ({eur.format(budget.pilot.usedEur)} van {eur.format(budget.pilot.limitEur)} gebruikt).
          {" "}
          {provider
            ? provider.external
              ? `AI-aanbieder: ${provider.name}, model ${models.find((m) => m.id === provider.model)?.label ?? provider.model}.`
              : "Er is alleen een testaanbieder ingesteld: er gaat niets naar buiten."
            : "Er is nog geen AI-aanbieder gekozen: er wordt niets verstuurd."}
        </p>
        <p className="page-intro">
          AI werkt alleen met je eigen notities en, bij uitleg, met verzen uit vrij te gebruiken vertalingen (nooit HSV of NBV21).
          Elk antwoord toont de bronnen. Is er te weinig bron, dan zegt AI dat eerlijk in plaats van iets te verzinnen.
        </p>
      </section>

      <section id="gegevens" className="settings-section" aria-labelledby="export-heading">
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

      <section className="settings-section" aria-labelledby="delete-heading">
        <h2 id="delete-heading">Account verwijderen</h2>
        <p className="page-intro">
          Stop je met de test? Dan kun je je account met alles erin zelf verwijderen. Lees ook <Link href="/privacy">wat er met je gegevens gebeurt</Link>.
        </p>
        <DeleteAccount />
      </section>

      <section id="offline" className="settings-section" aria-labelledby="offline-heading">
        <h2 id="offline-heading">Offline en synchronisatie</h2>
        <p className="page-intro">Zie wat er op dit apparaat staat en wat nog verstuurd moet worden.</p>
        <Link className="button secondary" href="/sync">Offline en synchronisatie</Link>
      </section>
    </>
  );
}
