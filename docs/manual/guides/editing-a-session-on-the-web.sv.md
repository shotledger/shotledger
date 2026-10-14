# Ändra ett pass på webben

Med synk påslagen kan webbappen ändra eller ta bort ett pass: rätta ett datum,
en plats eller ett vapen, eller skriva om en serie som blev fel. Logga in,
öppna **Pass**, klicka på passet och sedan **Redigera** eller **Ta bort pass**.

## Ändra passet

**Redigera** öppnar passets fält som telefonens redigeringsskärm har dem:
namn, datum och tid, vapen och ammunitionsparti först, sedan tävlingsfälten för
en tävling. Plats och anteckningar ligger hopfällda under **Detaljer**; klicka
för att öppna dem. Ett val som vapnet eller tävlingsnivån är en rad knappar där
den valda är ifylld; **Ingen** rensar valet. Ett tomt namn behåller passets namn; en tom plats eller
anteckning rensar den. Ett nytt datum före 1900 eller senare än i morgon
avvisas, som i Mata in serier, och datum och tid skrivs i samma format som där.
Typ, gren, matchformat och decimalräkning
bestäms när passet skapas och förblir som de är.

Under fälten är varje serie i grundomgången en rad skott, skrivna som i
[Mata in serier](entering-series-on-the-web.md#skriv-serierna). Ändra en rad
för att skriva om serien; dess gamla skott ersätts, som när du matar in en
serie igen i telefonen. **Ta bort serie** tar bort raden när du sparar
(**Ångra** tar tillbaka den), och **Lägg till serie** lägger till en efter den
sista serien. I fritt format kryssar du i **Provserie** på den rad som är en
provserie.

Ett fältskjutningspass visar i stället sina stationer, var och en med
telefonens stationsfält som i [Mata in serier](entering-series-on-the-web.md):
**Träff**, **Träffade figurer**, **Figurer**, **Poäng**, **Maxpoäng** och
**Struken**, där varje antal är en rad tal att klicka på, som i telefonen. En station behåller sitt nummer, som i telefonen, så efter en
borttagen station blir det ett hopp i numreringen. Ändra en stations fält för
att rätta den. **Ta bort station** tar bort den när du sparar (**Ångra** tar
tillbaka den), och **Lägg till station** lägger till en efter den sista
stationen. **Starta särskjutning** visas som i telefonen: är den sista
stationen en särskjutningsstation blir varje ny station det också. En ny
station där inget är ifyllt sparas inte. Resultatformen (**Fält** eller
**Poängfält**) visas men går inte att ändra, som i telefonen.

Ett pass med bara skott visar **Avlossade skott**, som i
[Mata in serier](entering-series-on-the-web.md#bara-antal-skott): ett heltal
från 0 till 10 000, eller tomt för inget. Ett fältskjutningspass med bara skott
visar båda.

Finalserier och serier sparade med bara totalsumma (från Webshooter) visas men
går inte att ändra här, och inte heller matchformatet eller taggar. Ändra dem i
telefonen.

En serie med foto är märkt **Foto**; klicka på det för att visa eller dölja
fotot under raden. Ett foto som ännu inte laddats upp från telefonen visas som
inte uppladdat, som på passets sida. Fotot stannar hos sin serie när du skriver
om skotten, men markeringarna du satt på det visas inte längre, som när du
skriver om serien i telefonen. En serie sparad med ett foto och inga skott
visas som en tom rad märkt **Foto**; lämnas den tom förblir den som den är. Den
här sidan lägger inte till eller tar bort foton.

## Spara

**Spara ändringar** (eller **Ctrl+Enter**, **Cmd+Enter** på en Mac) skickar
alla ändringar på en gång, och telefonen får dem vid nästa synk. Bara en
del som under tiden tagits bort på en annan enhet kan avvisas (se nedan). Vapnets skottantal ändras med skillnaden: skriver du om en
serie på fem skott till tre dras två skott av, varje station som läggs till
eller tas bort lägger till eller drar av sex, ett nytt antal skott ändrar det
med skillnaden, och byter du vapen flyttas
passets skott från det gamla vapnet till det nya. Ändras flera serier i samma
sparning och skottantalet redan är lägre än skotten som dras av, stannar
antalet på 0 en gång i stället för serie för serie, så det kan bli något lägre
än telefonen skulle ha lämnat det.

Sparningen läser passet igen först. Har passets egna fält, en serie du ändrat,
eller (när du ändrat någon station) någon av dess stationer ändrats, lagts till
eller tagits bort på en annan enhet sedan du öppnade det skickas ingenting och sidan säger det: kopiera det du vill
behålla och tryck sedan **Ladda om** för att börja om från passet som det är
nu. Har det tagits bort på en annan enhet skickas inte heller något. En
ändring i telefonen under sekunderna mellan den kontrollen och sparningen kan
ändå gå förlorad, och en serie som skrivs om på båda kan få båda
uppsättningarna skott; den senare sparningen vinner.

För att spara krävs en anslutning. Går servern inte att nå finns dina
ändringar kvar på sidan och knappen blir **Försök igen**, som skickar exakt
samma ändring igen, så ingenting ändras två gånger. Ändrar du något släpps den
kopian. Avvisades en ändring för att något under tiden tagits bort på en annan
enhet säger sidan det och namnger vapnet vars skottantal du bör kontrollera
med **Justera antal skott** i telefonen.

## Ta bort

**Ta bort pass** frågar först och namnger passet och hur mycket vapnets
skottantal minskar. Borttagningen tar också bort dess serier, skott och
fältstationer och går inte att ångra. Dess foton finns kvar i kontot.

Borttagningen läser passet igen först. Har dess fält, en serie eller en
fältstation ändrats, lagts till eller tagits bort på en annan enhet sedan
sidan visade det, eller en serie skrivits om där, tas ingenting bort och sidan säger det:
**Ladda om** visar passet som det är nu, och Ta bort pass frågar igen med det
nya skottantalet. Har det redan tagits bort på en annan enhet skickas inte
heller något.

En sparning eller borttagning kan röra högst 500 rader. Ett så stort pass
ändras i telefonen.
