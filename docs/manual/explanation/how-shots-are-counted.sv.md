# Hur avlossade skott räknas

Flera skärmar visar hur många skott du har skjutit: **Loggade skott** på
startsidan och i statistikrapporten, en ammunitionssats åtgång, ett vapens
**Antal skjutna skott** och **Skott sedan underhåll**, skytteloggens
**Skott**, JSON-rapporten och antalet som visas innan du importerar en fil. De
räknar alla på samma sätt, så de stämmer alltid med varandra.

## Vad som räknas

Ett pass avlossade skott är:

- varje skott i varje serie, **provserier inräknade**;
- för en serie som bara sparats som en summa, till exempel ett resultat
  importerat från Webshooter, antalet skott summan bestod av;
- passets **extraskott**, de oräknade skott du loggat som ett antal;
- **sex för varje fältstation**, även en struken station och en
  särskjutningsstation.

Ett skott räknas här för att det avlossades, oavsett vad det gav. Det är en
annan fråga än vad som räknas till ett resultat: en provserie eller en struken
station lägger aldrig till något till din poäng — se [Hur provserier
räknas](how-sighters-count.md) — men skotten gick ändå genom vapnet och ur
ammunitionsasken.

## När appen inte vet

En serie importerad från ShotLog är en summa utan antal skott, så appen vet
inte hur många skott det var. Den räknar **inga** i stället för att gissa. Lägg
in skotten som extraskott på passet om du vill att de ska räknas.

## Vapnets räknare och äldre importer

Ett vapens räknare förs som löpande summor: att logga, ändra eller ta bort ett
pass flyttar dem med den skillnad det gör. En serie importerad från Webshooter
började räknas först i den här versionen, så ett vapen vars pass har en sådan
serie från tidigare visar lägre än vad passen summerar till.
