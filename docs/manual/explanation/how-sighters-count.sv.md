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
  skotträknare och din ammunitionsåtgång — se [Hur avlossade skott
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

## Förutsäger provserien matchen?

Rapportens kort **Provserie och resultat** ställer varje tävlings provserie
bredvid dess match: en punkt per tävling, provseriens snitt per skott i sidled
och matchens snitt per skott i höjdled. Finaler räknas inte in i matchen,
eftersom bara de bästa skjuter en. En ISSF-matchs provserier per moment slås
ihop. Träningspass räknas inte, och inte heller tävlingar utan provserie.

Varje gren får ett eget kort, eftersom ett milsnabbskott och ett
precisionsskott har olika snitt och en blandning skulle hitta på ett samband.
Under 10 tävlingar säger kortet bara hur många fler det behöver. Från 10 ger
det Pearsons korrelation **r**, från −1 till 1, och säger det i ord. Under 0,1
säger provserien lite om matchen. Från 0,1 är sambandet svagt, från 0,3
måttligt och från 0,5 starkt. Det är de vanliga tumregelgränserna.

Det visar om de två **hänger ihop**, inte att det ena **orsakar** det andra.
En bra dag, vädret eller banan kan lyfta både provserien och matchen.

Kortet bryr sig inte om filtret **Provserier**: provserien är det som mäts,
och matchen tar aldrig med den.
