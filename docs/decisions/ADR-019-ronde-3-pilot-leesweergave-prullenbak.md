# ADR-019 — Ronde 3: leesweergave, prullenbak, samenvatting bij de notitie, AI-modelkeuze en besloten pilot

Status: gebouwd op branch `claude/project-thread-63mk8v`. Live uitrollen en uitnodigen pas na
akkoord van de eigenaar.

## 1. Afgeronde notities openen in de leesweergave

- `/notes/<id>` toont een **afgeronde** notitie in de leesweergave (de preekweergave hergebruikt).
  Bewerken is een uitdrukkelijke knop naar `/notes/<id>?bewerken=1`. Concepten openen in de editor.
- Oude links blijven werken: `/notes/<id>/preek` stuurt door naar `/notes/<id>`.
- Heeft dit apparaat nog niet verstuurde wijzigingen, dan zegt de leesweergave dat en linkt naar de
  editor (nooit stil overschrijven).

## 2. Concepten verwijderen naar een prullenbak

- Alleen **concepten** kunnen weg, en alleen door de eigenaar: `notes.deleted_at` met een
  databaseregel (`deleted_at is null or status = 'concept'`) en `set_note_trashed` (RLS + eigenaar).
- Niets wordt gewist: tekst, versies en koppelingen blijven. Ongedaan maken direct na weggooien;
  terugzetten vanuit **Notities → Prullenbak**.
- Een concept in de prullenbak telt nergens mee: zoeken, passagepanelen, tijdlijn, AI-bronnen,
  collecties en de export (ook de koppelingen ernaar) laten het weg.
- Definitief wissen hoort niet bij deze ronde (CLAUDE.md: geen data verwijderen zonder akkoord).

## 3. AI-samenvatting bij de bronnotitie

- "Opslaan bij deze notitie" bewaart de gekozen AI-opzet als **apart onderdeel** in
  `note_summaries` (één per notitie, eigenaar + RLS). Het document van de notitie verandert niet
  (never mutate notes with AI); de samenvatting onthoudt de versie en content hash waar hij bij hoort.
- Verandert de notitie daarna, dan staat er "verouderd" met een link naar de versie. Vervangen vraagt
  bevestiging; verwijderen kan altijd.
- **Niet in de export**, net als de andere afgeleide AI-gegevens (ADR-013, ADR-018).

## 4. AI-model per gebruiker

- De server bepaalt welke modellen te kiezen zijn: die van de ingestelde aanbieder, eventueel
  beperkt met `AI_MODELS`. `AI_MODEL` is het standaardmodel. De sleutel blijft op de server.
- De keuze staat per account in `user_preferences.ai_model`. De API weigert een model dat niet mag;
  bij elke AI-taak wordt opnieuw gecontroleerd. Valt een model weg, dan gebruikt de app het
  standaardmodel en zegt Instellingen dat.
- Budgetten tellen per maand, niet per model: wisselen verandert niets aan wat al gebruikt is.

## 5. Besloten pilot met uitnodigingslinks

- Gekozen door de eigenaar: **uitnodigingslinks vanuit de app**. Openbare aanmelding blijft uit.
- Een beheerder (`app_admins`, alleen via SQL toe te voegen) maakt in **Beheer** een link voor één
  e-mailadres: 1–30 dagen geldig, intrekbaar, één keer bruikbaar. Alleen de sha-256 hash van de
  token staat in de database. Het account wordt op de server aangemaakt met `SUPABASE_SECRET_KEY`.
- Herstel: Supabase verstuurt op het gratis plan alleen mail naar het eigen team, dus een beheerder
  maakt een **herstellink** (zelfde mechanisme, kortere geldigheid).
- Toegang intrekken blokkeert inloggen en beëindigt sessies; de gegevens blijven bewaard.
- Iedere persoonlijke tabel had al `owner_id` + RLS; de pilot voegt toe: tests die voor elke tabel
  controleren dat een tweede account niets ziet, en één account per browseropslag voor offline
  gegevens (wisselen van account op één apparaat wist de lokale kopie, behalve als er nog
  onverzonden wijzigingen of conflicten zijn: dan weigert de app de lokale opslag voor het andere
  account).
- AI: een budget per account per maand (standaard € 5) en een **gedeeld pilotbudget** (standaard
  € 25), beide in Beheer → AI-budget. Nieuwe AI-taken stoppen bij 90% van een van beide.

## Terugdraaien

Zie `docs/runbooks/pilot.md`: vorige Vercel-deploy terugzetten en `SUPABASE_SECRET_KEY` weghalen.
De migraties voegen alleen toe; ze hoeven niet teruggedraaid te worden.
