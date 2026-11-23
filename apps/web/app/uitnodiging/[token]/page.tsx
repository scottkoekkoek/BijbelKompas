// Ronde 3 §6: the page behind an invitation or recovery link. Public, shows nothing private: only
// whether the link can still be used. The token is never put in the page's own links.
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { isTokenShape, tokenHash } from "@/lib/pilot/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { RedeemForm } from "./RedeemForm";

export const metadata: Metadata = { title: "Uitnodiging", referrer: "no-referrer", robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = {
  gebruikt: "Deze link is al gebruikt. Log in met je e-mailadres en wachtwoord.",
  ingetrokken: "Deze link is ingetrokken. Vraag zo nodig een nieuwe aan bij wie je uitnodigde.",
  verlopen: "Deze link is verlopen. Vraag een nieuwe aan bij wie je uitnodigde.",
  onbekend: "Deze link werkt niet. Controleer of je hem helemaal hebt gekopieerd.",
  uit: "Aanmelden via een link staat op dit moment uit.",
};

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  let state = "onbekend";
  if (!admin) state = "uit";
  else if (isTokenShape(token)) {
    const r = await admin.rpc("pilot_invitation_state", { p_token_hash: tokenHash(token) });
    state = typeof r.data === "string" ? r.data : "onbekend";
  }
  const usable = state === "uitnodiging" || state === "herstel";

  return (
    <AuthCard title={state === "herstel" ? "Nieuw wachtwoord" : "Welkom bij BijbelKompas"}>
      {usable ? (
        <>
          <p className="page-intro">
            {state === "herstel"
              ? "Kies een nieuw wachtwoord voor je account."
              : "Je bent uitgenodigd voor de besloten test. Maak hier je eigen account aan: je notities zijn alleen voor jou."}
          </p>
          <RedeemForm token={token} recovery={state === "herstel"} />
        </>
      ) : (
        <>
          <p className="alert info">{MESSAGES[state] ?? MESSAGES.onbekend}</p>
          <p>
            <Link href="/login">Naar inloggen</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
