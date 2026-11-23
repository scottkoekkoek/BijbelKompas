// Ronde 3 §6: invitation and recovery links. The token is random (256 bits) and shown once; only its
// sha-256 is stored, so a database copy cannot be turned back into a working link.
import { createHash, randomBytes } from "node:crypto";

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
/** A token as it appears in a link: 43 base64url characters. */
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

export const VALIDITY_DAYS = { min: 1, max: 30, invitation: 7, recovery: 2 } as const;

/** The text the administrator can paste into an e-mail or chat message. No personal data in it. */
export function invitationText(link: string, days: number) {
  return [
    "Hoi,",
    "",
    "Je bent uitgenodigd om mee te testen met BijbelKompas, een rustige app voor Bijbelstudie en eigen notities. Het is een besloten test: alleen mensen met een uitnodiging kunnen inloggen, en je notities zijn alleen voor jou.",
    "",
    `Maak je account aan via deze persoonlijke link (${days === 1 ? "1 dag" : `${days} dagen`} geldig, één keer te gebruiken):`,
    link,
    "",
    "Gebruik het e-mailadres waarop je deze uitnodiging kreeg en kies een eigen wachtwoord. Daarna log je voortaan in op de inlogpagina van de app.",
    "",
    "Ik ben benieuwd hoe lezen, schrijven en terugvinden werkt op jouw telefoon, tablet of computer. Gebruik voor de test geen gevoelige persoonlijke gegevens.",
  ].join("\n");
}

export function recoveryText(link: string) {
  return [
    "Hoi,",
    "",
    "Hier is een link om een nieuw wachtwoord voor BijbelKompas in te stellen. Hij is kort geldig en werkt één keer:",
    link,
  ].join("\n");
}
