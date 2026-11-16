# ADR-006 — Offline schrijven en synchroniseren

Status: gebouwd in Sprint 5 (BK-025 t/m BK-029, BK-033, BK-056). Volgt afspraak 1 uit ADR-000:
geen samenvoegen per blok, nooit stil overschrijven, bij twijfel een conflictkopie.

## Besluit

**Eerst lokaal, dan de server.** De editor bewaart elke wijziging eerst in de browser (IndexedDB) en
toont dan "Lokaal opgeslagen". De synchronisatie stuurt het daarna naar de server; pas als de server
het heeft, staat er "Opgeslagen". Tekst en wachtrij worden in één transactie geschreven, zodat er
nooit tekst is zonder bijbehorende wachtrij of andersom.

**Wachtrij per notitie.** Per notitie is er hooguit één verstuurde bewerking (`sent`) en één
wachtende (`pending`). Nieuwere tekst vervangt de wachtende; de sterkste reden voor een versie blijft
bewaard (afronden > handmatig > schrijfpauze). Een verstuurde bewerking zonder antwoord gaat opnieuw
met **hetzelfde** bewerkings-id; de server (`sync_apply`) voert elk id per apparaat maar één keer uit
en geeft bij herhaling het eerste antwoord terug (AT-07).

**Basisversie hoort bij de tekst.** Elke bewerking vertelt op welke serverversie de tekst gebouwd
is. Is de notitie intussen elders gewijzigd, dan antwoordt de server "conflict" en verandert er
niets. Een nieuwere serverkopie die binnenkomt terwijl er lokale tekst wacht, verschuift die
basisversie nooit.

**Conflicten.**
- Staat de notitie open: de schrijver kiest "Bewaar mijn tekst als conflictkopie" of "Nieuwste versie
  laden". Er wordt niets overschreven.
- Staat de notitie niet open: de lokale tekst wordt automatisch een nieuwe notitie
  "… (conflictkopie datum tijd)", het origineel volgt de server weer. De synchronisatiepagina toont
  dit tot de schrijver het als afgehandeld markeert.

**Eén tabblad tegelijk per notitie.** Een geopende editor houdt een Web Lock vast. Een tweede tabblad
toont de notitie alleen-lezen. Twee tabbladen in dezelfde browser delen één lokale kopie; zonder
deze regel kon de ene de tekst van de andere ongemerkt vervangen.

**Wat staat er offline.** De 30 recentste notities (instelling `offline_recent_limit`), vastgezette
notities, notities die de afgelopen 7 dagen geopend zijn, en alles met niet-verstuurde tekst.
Niet-verstuurde tekst wordt nooit opgeruimd.

**Service worker.** Die bewaart alleen de app-schil: de statische pagina `/offline` en de
bouwbestanden daarvan. Pagina's met persoonlijke gegevens en de API worden nooit door de service
worker bewaard. Lukt het laden van een pagina niet, dan gaat de browser naar `/offline`, die de
notities uit de eigen opslag van de browser laat zien.

**Veilig uitloggen (BK-056).** Staat er nog iets in de wachtrij, dan waarschuwt de app eerst en
blijft de lokale tekst bewaard. Is alles verstuurd, dan wist uitloggen alle lokale gegevens.

## Overwogen

- **Samenvoegen per blok** (zoals in de oorspronkelijke specificatie): afgewezen in ADR-000; te
  foutgevoelig voor één gebruiker, en een conflictkopie is begrijpelijker.
- **Laatste schrijver wint:** in strijd met "nooit stil overschrijven".
- **Pagina's laten cachen door de service worker:** dan zouden persoonlijke notities in een tweede
  opslag terechtkomen die moeilijk te wissen is; IndexedDB is de enige plek.

## Gevolgen

- Een browser zonder lokale opslag (bijvoorbeeld sommige privévensters) slaat direct op de server op,
  zoals vóór Sprint 5; offline schrijven werkt daar niet.
- Elk apparaat registreert zichzelf (`devices`), zodat herhaalde bewerkingen herkenbaar zijn.
- Een schemawijziging aan de lokale opslag vraagt een nieuwe IndexedDB-versie met een upgradestap.
