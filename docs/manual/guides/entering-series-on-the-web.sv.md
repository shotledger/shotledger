# Mata in serier på webben

Med synk påslagen kan webbappen ta emot ett helt pass från tangentbordet: en
tävling du inte loggade på skjutbanan, eller en sida ur en gammal
pappersloggbok. Logga in och öppna **Mata in serier** i menyn till vänster.

## Fyll i passet

Fälten är telefonens formulär för nytt pass: typ, loggning, reglemente, gren,
matchupplägg, datum och tid, namn och plats, sedan tävlingsfälten, vapen och
ammunitionsparti. Datum och tid är när du sköt, i datorns tidszon; båda börjar
på nu.

Klass och ISSF-gren utgår från profilen du har angett under **Inställningar →
Personligt** i telefonen, som synken för över till kontot: födelseår, klass
och brytaren för damklasser. Din egen klass är förvald och står först, och de
grenar du får delta i kommer först, som i telefonen. Utan profil är ingenting
förvalt. Reglementena du har slagit på och **Inställningar → Valfria fält**
stannar i telefonen, så webben erbjuder alla reglementen och frågar alltid
efter vapengrupp och klass i en tävling. Se
[Vapengrupp och klass](../reference/weapon-group-and-class.md).

Serier i fältskjutning finns inte här; mata in dem i telefonen. Ett
fältpass som bara loggar antal skott går att mata in här.

## Bara antal skott

Välj **Bara antal skott** under **Loggning** för att föra in hur många skott
du sköt, utan serier. Passets fält finns kvar; **Avlossade skott** ersätter
matchupplägget och serieraderna. Lämna fältet tomt om du inte vet antalet.
Annat än ett heltal avvisas innan något skickas.

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

### En final

I precision med **Hela matchen** vald visas **Starta final** när en serie har
ett skott. Den lägger till en rad under **Final**, och varje rad som läggs
till efter den hör till finalen, som kan ha en egen provserie. Finalen räknas
för sig, skild från grundomgången, som i telefonen. En final utan skott sparas
inte, så töms finalens rader försvinner den igen. En final kräver minst en
poängsatt serie före den; saknas en säger **Spara** det och skickar ingenting.

## Spara

**Spara** skickar hela passet på en gång; det sparas antingen helt eller inte
alls. Telefonen får det vid nästa synk, och ett valt vapens skottantal ökar med
skotten, provserier och final inräknade, eller med de avlossade skotten.

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
