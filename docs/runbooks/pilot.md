# Runbook — Besloten pilot (ADR-019)

Voor de beheerder (Scott). Deel nooit sleutels of wachtwoorden in een chat, issue of commit.

## 1. Eenmalig klaarzetten

1. **Back-up en export.** Maak in de app een export (Instellingen → Alles exporteren) en kijk of de
   laatste back-up in GitHub Actions groen is.
2. **Migraties.** Draai in GitHub Actions "Migraties naar productie". Nieuw in deze ronde:
   `20261123000001_prullenbak`, `20261123000002_samenvatting_bij_notitie`,
   `20261123000003_besloten_pilot`, `20261123000004_ai_modelkeuze`,
   `20261123000005_passage_notes_zonder_tekst` en (ronde 4) `20261124000001_pilotveiligheid` t/m `20261124000004_te_valideren`. Ze voegen toe of verbeteren een functie; er wordt niets gewist.
   - De pilotmigratie maakt het enige bestaande account (jij) beheerder. Staat er meer dan één
     account, dan wordt niemand gekozen; maak jezelf dan beheerder in de SQL-editor van Supabase:
     `insert into public.app_admins (user_id) select id from auth.users where email = '<jouw adres>';`
3. **Geheime sleutel.** Supabase → Project Settings → API Keys → de *secret* key (of de
   `service_role` key). Zet hem in Vercel → Settings → Environment Variables als
   `SUPABASE_SECRET_KEY`, alleen voor **Production**, en deploy opnieuw. Zet hem nooit met een
   `NEXT_PUBLIC_`-voorvoegsel en nooit in Preview.
4. **Registreren blijft uit.** Controleer in Supabase → Authentication → Sign In / Providers dat
   "Allow new users to sign up" **uit** staat. Accounts ontstaan alleen via een uitnodigingslink.
5. **Site-URL.** Authentication → URL Configuration: de Site URL is de productie-URL. (Nodig voor
   "Wachtwoord vergeten"; uitnodigingen gebruiken geen e-mail.)

## 2. Een tester uitnodigen

1. Open **Beheer** (in de zijbalk of via Meer).
2. Vul het e-mailadres in, kies de geldigheid (standaard 7 dagen) en kies **Uitnodiging maken**.
3. Kopieer de **tekst met link** en stuur die zelf (mail, WhatsApp). De link is één keer te gebruiken,
   alleen met dit e-mailadres, en verloopt vanzelf. Je ziet hem maar één keer; kwijt? Maak een nieuwe
   (de oude vervalt dan).
4. De tester opent de link, vult hetzelfde e-mailadres en een eigen wachtwoord in en is meteen
   ingelogd. Daarna inloggen via `<productie-url>/login`.

Een open link trek je in met **Intrekken** bij Links. Daarna geeft hij geen toegang meer.

## 3. Wachtwoord kwijt (accountherstel)

- De tester kan zelf **Wachtwoord vergeten** gebruiken. Let op: de gratis e-mail van Supabase
  bezorgt alleen bij adressen van het eigen team. Komt er geen mail, gebruik dan:
- **Herstellink** bij het account in Beheer (2 dagen geldig, één keer). Stuur de link zelf door;
  de tester kiest een nieuw wachtwoord en is daarna ingelogd.

## 4. Toegang intrekken

- **Toegang intrekken** bij het account: de tester wordt uitgelogd (open sessies eindigen) en kan
  niet meer inloggen. Een al geladen pagina kan nog hoogstens een uur werken tot de sessie
  verloopt; elke nieuwe pagina stuurt naar de inlogpagina.
- **De gegevens blijven bewaard** en blijven alleen van dat account. Niemand anders ziet ze, ook de
  beheerder niet. **Toegang herstellen** geeft alles terug.
- **Definitief verwijderen**: Supabase → Authentication → Users → het account → Delete user. Dat wist
  alle notities, versies, vragen, collecties, instellingen en AI-gegevens van dat account
  (`on delete cascade`). Niet terug te draaien, behalve via een back-up.

## 5. Terugrollen

- **App**: Vercel → Deployments → de vorige deploy → *Promote to Production*. De nieuwe tabellen en
  kolommen hinderen de oude app niet (alleen toegevoegd).
- **Pilot stoppen zonder terugrollen**: haal `SUPABASE_SECRET_KEY` weg uit Vercel en deploy opnieuw.
  Nieuwe links werken dan niet meer; bestaande testers kunnen nog inloggen tot je hun toegang intrekt.
- **Database**: de migraties voegen alleen toe; terugdraaien is niet nodig. Moet het toch, volg
  `backup-terugzetten.md` in een nieuw, leeg project.

## 6. AI tijdens de pilot

- AI staat per account **uit** tot de tester het zelf aanzet (Instellingen → AI).
- Budget per account per maand en een **gedeeld pilotbudget** voor alle accounts samen; beide stel
  je in bij Beheer → AI-budget. Nieuwe AI-taken stoppen bij 90% van een van beide.
- **Eigen limiet per account** (ADR-020): bij Beheer → Accounts vul je bij iemand een bedrag in en kies je
  **Limiet opslaan**. Leeg laten en opslaan zet het account terug op de standaard. Je ziet alleen de limiet,
  niet wat iemand gebruikt.
- Zet ook bij Anthropic zelf een maandlimiet (harde rem, ADR-016).

## 7. Feedback, privacy en account verwijderen (ADR-020)

- **Feedback**: testers gebruiken de knop **Feedback** in de zijbalk of onder Meer. Je leest alles bij
  Beheer → Feedback van testers, met e-mailadres, pagina en schermgrootte. Andere testers zien het niet.
- **Privacy**: stuur testers naar `/privacy`; die pagina staat ook op het inlogscherm en de uitnodiging.
  Pas de tekst aan als er iets verandert in hosting, back-ups of de AI-aanbieder.
- **Account verwijderen**: een tester doet dit zelf bij Instellingen → Account verwijderen (wachtwoord +
  VERWIJDEREN). Daar is `SUPABASE_SECRET_KEY` voor nodig. Alles van dat account gaat direct uit de
  database; uit de back-ups verdwijnt het na 90 dagen. Ben jij de enige beheerder, dan kun je jezelf niet
  verwijderen.
- **Wachtwoord vergeten**: zonder SMTP komt er geen mail; de melding verwijst naar jou. Maak dan bij
  Beheer een herstellink.
