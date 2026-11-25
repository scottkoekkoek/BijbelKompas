import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";

export const metadata: Metadata = { title: "Privacy" };

/**
 * Ronde 4 (V10): what BijbelKompas keeps, where, who can see it, and how to take it with you or
 * remove it. Public, so a tester can read it before making an account. Plain words, no legalese.
 */
export default function PrivacyPage() {
  return (
    <AuthCard title="Privacy" wide>
      <div className="privacy-text">
        <p className="page-intro">
          BijbelKompas is een besloten test. Je notities zijn van jou: alleen jij kunt ze lezen. Hieronder staat wat er bewaard wordt, waar dat
          gebeurt en hoe je alles meeneemt of weghaalt.
        </p>

        <h2>Wat er bewaard wordt</h2>
        <ul>
          <li>Je e-mailadres en je wachtwoord (alleen als onleesbare hash, niemand kan het terugzien).</li>
          <li>Wat je in de app maakt: notities en hun versies, Bijbelkoppelingen, markeringen, gelezen verzen, collecties, vragen, sjablonen en je voorkeuren.</li>
          <li>Feedback die je via de knop Feedback stuurt, met de pagina en je schermgrootte.</li>
          <li>Als je AI gebruikt: de uitkomsten die je bewaart en wat elke AI-taak kostte.</li>
        </ul>

        <h2>Waar</h2>
        <ul>
          <li>De database staat bij Supabase in Frankfurt (EU). De website draait bij Vercel.</li>
          <li>
            Op je eigen apparaat staat een kopie, zodat je ook zonder internet kunt werken. Die wordt gewist als je uitlogt, tenzij er nog
            onverstuurde wijzigingen zijn.
          </li>
          <li>Twee keer per week wordt een versleutelde back-up gemaakt. Die wordt 90 dagen bewaard en alleen gebruikt om na een storing terug te zetten.</li>
        </ul>

        <h2>Wie het kan zien</h2>
        <ul>
          <li>Alleen jij ziet je notities. Andere testers niet, en de beheerder van de pilot in de app ook niet.</li>
          <li>
            De beheerder ziet per account alleen: het e-mailadres, wanneer het is aangemaakt en voor het laatst is ingelogd, hoeveel notities er
            zijn, de AI-limiet, en de feedback die je zelf stuurt.
          </li>
        </ul>

        <h2>AI</h2>
        <p>
          AI staat uit tot je het zelf aanzet bij Instellingen. Staat het aan en vraag je iets, dan gaan alleen de stukken uit je notities die
          voor die vraag nodig zijn naar Anthropic (de maker van Claude) in de Verenigde Staten. Anthropic gebruikt die gegevens volgens zijn
          voorwaarden niet om modellen te trainen. AI verandert nooit zelf je notities.
        </p>

        <h2>Meenemen of weghalen</h2>
        <ul>
          <li>Bij Instellingen, onder Gegevens, download je op elk moment alles als zip-bestand.</li>
          <li>
            Daar kun je ook je account verwijderen. Dan wordt alles van je account direct uit de database gewist. Uit de back-ups verdwijnt het
            vanzelf, uiterlijk na 90 dagen.
          </li>
          <li>Vragen hierover? Stel ze aan wie je heeft uitgenodigd.</li>
        </ul>

        <p>
          <Link href="/dashboard">Naar BijbelKompas</Link>
        </p>
      </div>
    </AuthCard>
  );
}
