# Runbook — Productie en herstel (BK-060)

Dit runbook is het startpunt bij een probleem met de app. Het verwijst naar de andere runbooks en
naar de beslissingen in `docs/decisions/`. Deel nooit wachtwoorden, sleutels of de age-privésleutel
in een chat, issue of commit.

## Overzicht

| Onderdeel | Waar | Wie |
| --- | --- | --- |
| App | Vercel (Hobby), project `bijbel-kompas` | Scott |
| Database en login | Supabase (gratis), project `bijbelkompas-prod` | Scott |
| Back-ups | GitHub Actions "Back-up productie", ma en do, 90 dagen bewaard, versleuteld (ADR-003) | automatisch |
| Herstelproef | GitHub Actions "Herstelproef productie", de 1e van elke maand | automatisch |
| Controle | GitHub Actions "Controle productie", 2x per dag `/api/v1/health` | automatisch |
| Migraties | GitHub Actions "Migraties naar productie", alleen handmatig | Scott |

- **Hersteldoelen (ADR-003):** RPO ongeveer 3 tot 4 dagen, want er komt twee keer per week een
  back-up. RTO ongeveer 1 uur, met de hand.
- **Daarnaast de eigen export:** met "Alles exporteren" maak je op elk moment een export, en zet je
  hem terug met "Export terugzetten" (ADR-009). Maak een export voor je iets groots doet.

## 1. Iets werkt niet: eerst kijken

1. Open `<productie-url>/api/v1/health`.
   - `"status":"ok"`: de app en de database werken. Het probleem zit dan in de app of in je eigen
     browser. Ga naar stap 2.
   - `"database":"niet bereikbaar"`: Supabase is gepauzeerd of heeft een storing. Volg
     `project-hervatten.md` en kijk op https://status.supabase.com.
   - Geen antwoord: Vercel heeft een storing of de deploy is mislukt. Kijk op
     https://www.vercel-status.com en in Vercel bij Deployments. Zet zo nodig de vorige deploy terug
     met "Promote to Production".
2. Kijk in Vercel → Logs. Daar staan alleen request-id's en foutcodes, nooit tekst uit notities
   (BK-059). Zoek op de request-id die de app in een foutmelding toont.
3. Offline geschreven tekst blijft in de browser staan tot hij verstuurd is. Wis bij een probleem
   dus **niet** de browsergegevens. De pagina Offline en synchronisatie laat zien wat nog wacht.

## 2. Een migratie draait niet of mislukt

- **"Queued" zonder voortgang:** dat ligt aan GitHub. Kijk op https://www.githubstatus.com. Na
  15 minuten mag je de run annuleren en opnieuw starten. Dat is veilig, want migraties die al
  toegepast zijn, slaat Supabase over.
- **Mislukt:** lees de log van de stap "Migraties toepassen". Een migratie draait in één transactie
  en wordt bij een fout volledig teruggedraaid. Maak er een issue van en zet de deploy van de app
  zo nodig terug naar de vorige versie.

## 3. Gegevens kwijt of beschadigd

Kies de kleinste ingreep die het probleem oplost.

1. **Eén notitie verkeerd bewerkt:** gebruik de versiegeschiedenis van die notitie. Herstellen maakt
   een nieuwe versie; er gaat niets verloren.
2. **Notitie per ongeluk gearchiveerd:** kijk in Notities → Archief en kies Terughalen.
3. **Meer kwijt, en je hebt een recente export:** Instellingen → Export terugzetten. Dit voegt alleen
   toe wat ontbreekt. Wat er al staat, wordt nooit overschreven.
4. **De database zelf is weg of onbruikbaar:** volg `backup-terugzetten.md`. Zet altijd terug in een
   **nieuw, leeg** project en nooit over bestaande data heen. Doe eerst de proef met
   `scripts/restore-drill.sh`.

## 4. Na een herstel controleren

- Je kunt inloggen en je ziet je eigen notities en verder niets.
- De aantallen kloppen met de export of met `counts.json` van de back-up (de herstelproef doet dit
  automatisch).
- Een notitie met Bijbelkoppelingen toont ze, en het vers in de lezer toont de notitie.
- De versiegeschiedenis van een afgeronde notitie is compleet.
- De pagina Offline en synchronisatie meldt "Gesynchroniseerd".

## 5. Regelmatig

- **Maandelijks:** kijk of de laatste back-up en de laatste herstelproef groen zijn.
- **Per kwartaal:** maak een export en bewaar die op een veilige plek buiten GitHub. Controleer ook
  of de age-privésleutel nog in je wachtwoordmanager staat.
