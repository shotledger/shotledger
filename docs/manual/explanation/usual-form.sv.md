# Hur "vanlig form" räknas fram

Statistikvyn i ett pass jämför passet med hur du brukar skjuta (se
[Ett pass mot din vanliga form](../guides/statistics.md#ett-pass-mot-din-vanliga-form)).
Den här sidan förklarar vad "vanligt" betyder där, och hur appen avgör om ett
pass var ovanligt.

## Vad som räknas som vanligt

Din vanliga form är de **100 serier du sköt före det här passet**, i samma gren
och samma klass. Bara pass som började tidigare räknas, så ett pass du lägger
till i dag ändrar aldrig vad ett äldre pass säger om sig självt. Provserier
räknas inte, precis som överallt inuti ett pass (se
[Hur provserier räknas](how-sighters-count.md)).

En serie som importerats som bara en total, utan enskilda skott, räknas med i
seriesnittet och det förväntade resultatet. Den kan inte räknas med i
skottsnittet eller andelen tior och nior, eftersom appen inte känner till dess
skott.

## Hur ovanligt var dagens pass

Varje skyttes serieresultat varierar lite från serie till serie. Appen ser hur
långt dagens seriesnitt ligger från ditt vanliga, och jämför det med hur mycket
dina serier brukar variera.

Den räknar också med hur många serier du sköt i dag. En bra serie kan lätt vara
tur. Tolv bra serier i rad är det mycket mindre sannolikt att de är, så samma
skillnad väger tyngre i ett långt pass än i ett kort.

| Vad det står            | Ungefär hur ofta en vanlig dag hamnar här |
| ----------------------- | ----------------------------------------- |
| Klart bättre än vanligt | ungefär 1 pass av 40                      |
| Bättre än vanligt       | ungefär 1 pass av 7                       |
| Ungefär som vanligt     | ungefär 2 pass av 3                       |
| Sämre än vanligt        | ungefär 1 pass av 7                       |
| Klart sämre än vanligt  | ungefär 1 pass av 40                      |

"Bättre än vanligt" är alltså en bra dag men ingen sällsynt, och "Klart" betyder
att skillnaden är svår att förklara med slumpen.

## När den inte säger något

Appen behöver minst **20 tidigare serier** innan den säger hur ovanligt ett pass
var. Med färre kan den inte avgöra hur mycket dina serier brukar variera, så den
visar siffrorna och hur många serier de bygger på, men lämnar omdömet. Finns
inga tidigare serier alls står det att det inte finns något att jämföra med än.
