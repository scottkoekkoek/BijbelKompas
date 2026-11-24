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

## Terugdraaien

De migratie voegt toe en herdefinieert functies met een extra, optionele parameter. De vorige app-versie
werkt er ongewijzigd mee (zonder token, dus zonder de nieuwe bescherming). Eerst migreren en daarna de
app uitrollen is daarom veilig; teruggaan naar de vorige deploy ook.
