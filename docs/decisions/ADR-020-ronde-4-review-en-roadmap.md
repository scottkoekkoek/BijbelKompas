# ADR-020 — Ronde 4: review en roadmap van 24 november 2026

Status: in uitvoering op branch `claude/project-thread-ax2rff`, per onderdeel een eigen commit.
Bron: het rapport `bijbelkompas/review-4/BijbelKompas-productreview-en-roadmap.md` (projectbestanden).
De eigenaar keurde alle punten goed en vroeg er een AI-limiet per gebruiker bij.

## 1. Pilotveiligheid (V1, V2, V11) en AI-limiet per account

**AI-taken sluit alleen de server af.** Tot nu toe kon elke ingelogde sessie `ai_finish` aanroepen met
een zelfgekozen bedrag, dus ook met € 0 voor een taak waarvoor de server Claude net had betaald. Met
één gebruiker was dat geen risico, met testers wel (gecontroleerd in de review: budget bleef € 0,00).

- Bij het reserveren geeft de server de sha-256 van een willekeurig token mee (`p_finish_hash`). De hash
  staat in `private.ai_job_tokens`, buiten bereik van de browser. Afsluiten kan alleen met het token.
- Een taak zonder hash (oude tests, handmatig aangemaakt) blijft zonder token af te sluiten; zo'n taak
  roept nooit een AI-aanbieder aan, dus er valt niets te ontwijken.
- Gekozen boven "alles via de geheime sleutel": AI blijft dan ook werken zonder `SUPABASE_SECRET_KEY`,
  en er hoeft geen tweede geheim in Vercel en de database te worden gezet.

**Niet dubbel betalen.** Vraagt de server een taak aan met een sleutel die nog loopt, dan antwoordt de
database `55P03` en de app "deze AI-taak loopt al". Een taak die langer dan tien minuten half blijft
(de serverfunctie is gestopt) telt als mislukt tegen de gereserveerde kosten; daarna mag een nieuwe poging.

**Account met herstellink verwijderbaar.** De regel "een herstellink heeft altijd een account" botste
met `on delete set null`; verwijderen faalde. Nu sluit een trigger open herstellinks vóór het verwijderen,
en geldt de regel alleen voor links die nog open zijn. De linkgeschiedenis blijft bewaard, ook als de
beheerder die hem maakte verdwijnt (`created_by` wordt leeg in plaats van alles te wissen).

**Leesvoortgang in de export.** "Alles exporteren" bevat nu `readVerses` (canonieke `BOEK.hoofdstuk.vers`),
en terugzetten voegt ze toe (`import_read_verses`, alleen toevoegen). Oudere exports blijven werken.

**AI-limiet per account.** Een beheerder geeft in Beheer → Accounts iemand een eigen maandlimiet
(€ 0–100) of laat het veld leeg voor de standaard. `ai_user_limits` heeft RLS: je ziet je eigen limiet,
de beheerder alle limieten. Wat iemand verbruikt, toont Beheer bewust niet (privé, zoals in ronde 3);
alleen het totaal van de pilot. De stopgrens blijft 90% van de limiet.

## 2. Archief schaalt (V3, V4, V5)

- De notitielijst toont 50 notities per pagina (`?pagina=`), met "Vorige 50" en "Volgende 50". De filters
  blijven bij het bladeren behouden.
- Op Home worden het totaal en het aantal concepten in de database geteld (`count`). Dat aantal stopte
  eerst bij de lijstlimiet van 200.
- Zoeken toont eerst 50 notities en met "Toon meer notities" 100. Woordtreffers die al onder "Bij deze
  passage" staan, worden niet nog een keer getoond.

## 3. Pilotstart (V8, V9, V10, V13)

- **Welkom.** Een account zonder notities ziet op Home een kaart met drie stappen. De kaart verdwijnt
  na "Sluiten" of na "Maak een voorbeeldnotitie", en dat blijft zo
  (`user_preferences.welcome_dismissed_at`). De voorbeeldnotitie bij Psalm 23 is een gewone notitie van
  de tester zelf.
- **Feedback.** Er is een pagina Feedback, te vinden in de zijbalk en onder Meer. Een bericht wordt per
  account opgeslagen in `feedback`, met RLS: je schrijft alleen in je eigen naam. Met het bericht gaan
  de pagina waar je vandaan kwam en de schermgrootte mee. Alleen de beheerder leest alles
  (`pilot_feedback()`, met het e-mailadres van de afzender). Berichten kunnen niet worden aangepast.
- **Privacy.** De pagina `/privacy` is openbaar en gelinkt vanaf inloggen, de uitnodiging, Meer en
  Instellingen. Er staat in wat er bewaard wordt, waar (Supabase in Frankfurt, Vercel, een kopie op het
  apparaat, en back-ups die 90 dagen bewaard worden), wat de beheerder ziet, en wanneer iets naar
  Anthropic gaat.
- **Account verwijderen.** Dit staat bij Instellingen. De tester typt het wachtwoord opnieuw (gecontroleerd
  op een losse client zonder cookies) en het woord VERWIJDEREN. Daarna verwijdert de server het
  auth-account met de geheime sleutel, en elke persoonlijke rij gaat mee via de cascade. Een
  databasetest controleert dat tabel voor tabel. Daarna wordt ook de offline kopie in deze browser
  gewist. De enige beheerder kan zichzelf niet verwijderen (`pilot_is_last_admin`).
- **Wachtwoord vergeten.** Er wordt geen e-mail verstuurd zolang er geen SMTP is ingesteld. De melding
  zegt nu daarom ook: "Geen mail ontvangen? Vraag dan een herstellink aan bij wie je heeft uitgenodigd."

## 4. Preekmodus (A1, A2, V6)

- **Snelle aantekening.** Hier staat nu "Ik zit in een preek". Vink je dat aan, dan wordt de notitie
  van het type Preek, met de datum van vandaag (Nederlandse tijd). De gemeente komt van de vorige preek;
  spreker en serie niet, want die wisselen. De dienst volgt het uur: ochtend, middag of avond.
- **Op Home.** Op zondag van 09:00 tot 12:00 en van 15:00 tot 20:00 staat de knop "Ik zit in een preek"
  vooraan. De preekmodus staat dan meteen aan.
- **Verwijzingen herkennen.** `findReferences` herkent "boek hoofdstuk:vers" in lopende tekst. Een vers
  is verplicht, zodat "om 10:30" of "Johannes 3" als gewone tekst nooit een koppeling wordt.
  - Korte woorden als "de" en "op" worden nooit als boeknaam gelezen.
  - Een dubbelzinnige naam ("Jo 2:1") geeft elk boek dat past, en de schrijver kiest.
  - In de snelle aantekening koppelt één tik de verwijzing aan de eigen regel (de alinea krijgt
    `passages`). In de editor staat onder de werkbalk "Koppelen?" voor de alinea met de cursor.
  - Er wordt nooit iets gekoppeld zonder tik, en de tekst zelf blijft ongewijzigd.

## Terugdraaien

De migratie voegt toe en herdefinieert functies met een extra, optionele parameter. De vorige app-versie
werkt er ongewijzigd mee (zonder token, dus zonder de nieuwe bescherming). Eerst migreren en daarna de
app uitrollen is daarom veilig; teruggaan naar de vorige deploy ook.
