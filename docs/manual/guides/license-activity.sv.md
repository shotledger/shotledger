# Skjutaktivitet

Vid ansökan om svensk vapenlicens ska föreningen intyga att du varit aktiv på
banan. Appen håller det underlaget utifrån de pass du ändå loggar.

Vad kravet faktiskt är, vilket av de två fallen som gäller dig och vad appen
medvetet inte håller reda på finns i
[Så räknas skjutaktiviteten](../explanation/license-activity.sv.md).

## Att slå på det

**Inställningar → Efterlevnad → Sverige (FAP 551-3)**. Lämnat på **Ingen** syns
ingenting av detta — vilket är rätt läge utanför Sverige.

Statusen visas sedan på startsidan och på varje vapen: hur många aktiviteter du
loggat i perioden, och hur många som krävs.

## Att välja ditt fall

Appen föreslår ett av de två fallen utifrån dina vapen, och säger varför den
valde det. För att ta över beslutet:

1. **Inställningar → Efterlevnad → Aktivitetskrav**.
2. Välj det fall som gäller dig.

När du väl valt ett står valet fast — att lägga till, ändra eller radera ett
vapen flyttar det inte igen. Fram till dess följer inställningen dina vapen.

Ser det föreslagna fallet fel ut, läs motiveringsraden under det först: den
pekar oftast på en uppgift som saknas på ett vapen snarare än på fallet självt.
Vapen som saknar vapentyp, kaliber eller licens märks som **Ofullständig** på
vapenfliken, och att fylla i dem kan flytta förslaget av sig självt.

## Att få ut det

**Inställningar → Säkerhetskopiering och data** exporterar allt. **PDF-exporten**
av föreningsloggen är den du lämnar till föreningen, och **JSON-exporten** bär
samma pass som data.

PDF:en följer den förtryckta personliga skytteloggen en förening delar ut,
kolumn för kolumn:

| Kolumn           | Vad den innehåller                         |
| ---------------- | ------------------------------------------ |
| Datum            | när du sköt                                |
| Plats            | banan                                      |
| Skytteaktivitet  | gren, och om det var träning eller tävling |
| Använt vapen     | vapnet på passet, eller _Ej angivet_       |
| Uppg. styrkta av | **lämnas tom, skrivs under för hand**      |

Två av dem är värda en förklaring.

**Använt vapen** finns där för att det är vapnets namn som visar aktivitet
_med ett visst vapen_ — vilket är det kraven för ytterligare enhandsvapen och
för förnyelse vilar på. Ett pass utan angivet vapen står som _Ej angivet_ i
stället för att falla bort: en sexmånadersperiod som tyst tappar rader tappar
pass som faktiskt räknades.

**Uppg. styrkta av** är medvetet tom. I en föreningslogg blir en rad ett bevis
när någon skriver under den, och det kan bara en människa göra. Appen skriver
ut den linjerade kolumnen och lämnar den i fred.

!!! note

    Appen känner inte till ditt namn — den har ingen anledning att spara det —
    så loggen skriver ut en tom rad att fylla i för hand, precis som
    signaturkolumnen.
