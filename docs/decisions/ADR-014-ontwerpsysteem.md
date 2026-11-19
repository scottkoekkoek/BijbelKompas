# ADR-014 — Ontwerpsysteem en vernieuwde interface

Status: gebouwd (los verzoek van de eigenaar, geen backlog-ID). Alleen de interface is veranderd;
functies, gegevens, API's, rechten en de offline-werking zijn gelijk gebleven.

## Besluit

- **Eén bron voor het ontwerp.** Alle kleuren, letters, afstanden, hoeken, schaduwen, hoogtes,
  bewegingen en lagen zijn tokens bovenaan `apps/web/app/globals.css`. Componenten gebruiken
  alleen tokens, zodat licht en donker vanzelf gelijk blijven.
- **Warme, rustige stijl blijft** (spec §4): papierkleurige achtergrond, diepgroen als enige
  hoofdkleur, warm goud alleen als accent. Koppen en Bijbeltekst in een serif, de rest in de
  systeemletter. Geen webfonts: die zouden een externe server raken en offline niet werken.
- **Donker thema is apart ontworpen**, geen omkering: diep groengrijs, vlakken worden lichter naarmate
  ze naar voren komen, kleuren minder verzadigd. Volgt het apparaat, of de keuze in Instellingen.
- **Navigatie per schermbreedte**
  - vanaf 1024 px: zijbalk met groepen (hoofdmenu, Ordenen, Instellingen) en onderaan
    synchronisatie en uitloggen;
  - 768–1023 px: smalle icoonbalk met dezelfde links (namen blijven voor schermlezers en als tooltip);
  - onder 768 px: bovenbalk met naam en synchronisatie, en onderin de bestaande vijf knoppen.
- **Iconen**: `lucide-react` (ISC-licentie, alleen in de browserbundel, geen netwerk). Alle iconen
  zijn decoratief (`aria-hidden`); de knop of link eromheen draagt de naam.
- **Dialoog bij uitloggen met onverstuurde wijzigingen** is nu een echt venster (op de telefoon een
  sheet van onderen), met Escape en klik buiten het venster om te annuleren. De tekst en keuzes
  zijn hetzelfde gebleven (BK-056).
- **Laadscherm**: tijdens het laden van een pagina een rustig skelet in plaats van een leeg scherm.
- **Bewegingen** zijn kort (120–260 ms) en staan uit bij `prefers-reduced-motion`.

## Toegankelijkheid

Kleurcombinaties voor tekst halen minstens 4,5:1 in beide thema's (gecontroleerd met axe in de
bestaande e2e-tests op telefoon, tablet en desktop). Aanraakdoelen zijn minstens 44 px, of 36 px
voor kleine knoppen naast elkaar met genoeg ruimte. Focus blijft altijd zichtbaar (gouden rand).

## Niet gedaan

- Geen toastmeldingen: de bestaande meldingen staan in de pagina en worden voorgelezen. Ze naar
  een zwevende melding verplaatsen zou de werking veranderen.
- Geen grafieken: er zijn geen gegevens waar een grafiek iets toevoegt.

## Verfijningsronde 2

Tweede, kritischere ronde op dezelfde identiteit (los verzoek van de eigenaar, geen backlog-ID).
Weer alleen interface; geen wijzigingen in database, API's, synchronisatie of inloggen.

- **Bijbellezer**: vertalingen als compacte segmentknop met duidelijke actieve stand; HSV en
  NBV21 blijven alleen externe links (met icoon en "opent externe website" voor schermlezers).
  Vergelijken is één knop per vertaling plus "Vergelijken sluiten". Vorig/volgend hoofdstuk als
  pijlen naast de titel. Tekstbreedte maximaal ±34em, regelafstand 1,85–1,9. Versnummers klein,
  hoger gezet en met een ruimer onzichtbaar klikvlak. Geselecteerde verzen krijgen een zachte
  groene achtergrond plus onderstreping (niet alleen kleur). Notities en vragen bij het hoofdstuk
  zijn compacte chips met aantal; op de telefoon scrollen ze zijwaarts.
- **Notitie-editor**: titel als groot invoerveld zonder rand; Soort en Datum klein ernaast;
  status en de documentknoppen (Opslaan als versie, Afronden/Terugzetten) in één balk boven de
  editor. Werkbalk in groepen (opmaak, koppen, lijsten) met scheidingslijnen en actieve stand;
  Bijbelverwijzing op een eigen rij eronder. Op de telefoon schuift de werkbalk mee met de pagina
  in plaats van te blijven plakken, zodat hij geen schrijfruimte afneemt. Versiegeschiedenis en
  Archiveren zijn rustige knoppen onderaan (zichtbaar gelaten, niet in een menu verstopt, zodat ze
  vindbaar blijven).
- **Dashboard**: compacte begroeting; de groene kaart is als geheel één link; statistiek als één
  smalle strook; recente notities met titel, status-stip, soort en datum rechts.
- **Mobiel**: kleinere marges, kleinere koppen, safe areas (`viewport-fit=cover` met
  `env(safe-area-inset-*)`), minder verticale ruimte bij liggend scherm.

Technisch ogende titels zoals "Studie mwo14kcjtz3" zijn testgegevens uit de e2e-tests in de
lokale database. De interface past titels niet aan; dat blijft een kwestie van de gegevens.
