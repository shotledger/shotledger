# Hur provserier räknas

En [provserie](../guides/logging-a-session.md#provserier) räknas olika
beroende på varifrån du tittar, och de två svaren går isär med flit. Den här
sidan förklarar varför.

## I ett pass, och utanför det

Inuti ett pass räknas en provserie aldrig. Den är inte en del av dagens
resultat, och passets total, seriesnittet och passets egen statistikflik
utelämnar den alla.

Utanför ett pass gäller något annat: **en provserie är en vanlig serie**. Över
månader av skytte är en provserie bara mer skytte — den gick genom samma vapen
mot samma tavla — så rapporten räknar med den i snitten, standardavvikelsen,
träffbilden och rekorden.

Ställ **Provserier** på **Räkna inte med** så utelämnas de igen, och då stämmer
varje siffra med det varje pass visar på sin egen sida.

Två saker ändrar sig inte:

- **Loggade skott** räknas alltid med provserier, i båda lägena. Du sköt de
  skotten oavsett vad serien kallades, och siffran måste stämma med vapnets
  skotträknare, din ammunitionsåtgång och skytteloggen — se [Hur avlossade skott
  räknas](how-shots-are-counted.md).
- Antalet **guldserier** räknar alltid med en provserie, i båda lägena. En
  femtia på en provserie ger märket precis som vilken annan serie som helst, så
  filtret har inget att säga till om där.

!!! note "Rekord kan komma från en provserie"

    Med **Räkna med** valt kan ett bästa passresultat eller ett rekord i antal
    innertior sättas av ett pass provserie — så rapportens bästa passtotal kan
    visa mer än passets egen sida gör. Välj **Räkna inte med** om du vill att
    rekorden ska betyda exakt det passsidorna betyder.

Filtret **Provserier** på [statistikfliken](../guides/statistics.sv.md) är där
du väljer mellan de två.
