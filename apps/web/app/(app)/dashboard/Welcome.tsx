import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { createSampleNote, dismissWelcome } from "./welcome-actions";

/** Ronde 4 (V8): shown once to a new account, until it is closed or the first note exists. */
export function Welcome() {
  return (
    <section className="welcome-card" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Welkom bij BijbelKompas</h2>
      <p>Fijn dat je meetest. Zo begin je:</p>
      <ol>
        <li>
          <strong>Lees.</strong> Open <Link href="/bible">de Bijbel</Link>, tik op een vers en kies “In notitie zetten”.
        </li>
        <li>
          <strong>Schrijf.</strong> Je notitie wordt vanzelf bewaard, ook zonder internet. Op je telefoon kun je inspreken met de microfoon op het
          toetsenbord.
        </li>
        <li>
          <strong>Rond af.</strong> Klaar met een preek of studie? Kies Afronden. Dan staat er een vaste versie die je altijd terugvindt.
        </li>
      </ol>
      <p className="hint">
        Iets onduidelijk of mis je iets? Laat het weten via <Link href="/feedback?van=/dashboard">Feedback</Link>. Je notities zijn alleen voor jou (
        <Link href="/privacy">privacy</Link>).
      </p>
      <div className="button-row">
        <form action={createSampleNote}>
          <SubmitButton className="button secondary" pendingText="Maken…">Maak een voorbeeldnotitie</SubmitButton>
        </form>
        <form action={dismissWelcome}>
          <SubmitButton className="button ghost" pendingText="Sluiten…">Sluiten</SubmitButton>
        </form>
      </div>
    </section>
  );
}
