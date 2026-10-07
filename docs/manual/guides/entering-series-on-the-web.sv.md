# Mata in serier på webben

Med synk påslagen kan webbappen ta emot ett helt pass från tangentbordet: en
tävling du inte loggade på skjutbanan, eller en sida ur en gammal
pappersloggbok. Logga in och öppna **Mata in serier** i menyn till vänster.

## Fyll i passet

Fälten är telefonens formulär för nytt pass: typ, reglemente, gren,
matchupplägg, datum och tid, namn och plats, sedan tävlingsfälten, vapen och
ammunitionsparti. Datum och tid är när du sköt, i datorns tidszon; båda börjar
på nu.

Fältskjutning finns inte här; mata in den i telefonen.

## Skriv serierna

En rad per serie. Skriv skotten med mellanslag emellan:

| Skriv      | Betyder                    |
| ---------- | -------------------------- |
| `0` – `10` | ringvärdet                 |
| `X`        | en innertia (X), värd 10   |
| `10.4`     | decimalräkning: 10,4       |
| `X.6`      | decimalräkning: inner 10,6 |

`x` fungerar lika bra som `X`, och `10,4` lika bra som `10.4`. Varje rad visar
sin summa och sina innertior medan du skriver.

- **Enter** går till nästa rad; i fritt format lägger Enter i sista raden till en rad.
- **Tab** och **Skift+Tab** flyttar mellan fälten.
- **Ctrl+Enter** (**Cmd+Enter** på Mac) gör det knappen under raderna gör.

Med **Hela matchen** vald läggs raderna ut som programmets serier, provserier
inräknade, som i telefonen. I fritt format kryssar du **Provserie** på den rad
som är provserie. **Lägg till serie** lägger till en rad.

## Spara

**Spara** skickar hela passet på en gång; det sparas antingen helt eller inte
alls. Telefonen får det vid nästa synk, och ett valt vapens skottantal ökar med
skotten, provserier inräknade.

För att spara krävs en anslutning. Om servern inte går att nå, eller svarar så
att det är oklart om passet kom fram, finns serierna kvar på sidan och
**Spara** blir **Försök igen**, som skickar exakt samma pass igen, så det
sparas inte två gånger. En tom rad till behåller den kopian; ändrar du något
annat släpps den, och nästa **Spara** skickar passet på nytt, så kom det
första försöket fram sparas det då två gånger.

Är du utloggad loggar du in igen på sidan. Loggar du in på ett annat konto
laddas det kontot i stället och det du skrivit töms, så inget från ett konto
sparas i det andra. Stänger du fliken försvinner det du skrivit; ingenting
sparas i webbläsaren.

Ändra eller ta bort ett pass i efterhand gör du i telefonen.
