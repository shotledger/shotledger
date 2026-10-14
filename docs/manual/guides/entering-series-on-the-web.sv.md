# Mata in serier på webben

Med synk påslagen kan webbappen ta emot ett helt pass från tangentbordet: en
tävling du inte loggade på skjutbanan, eller en sida ur en gammal
pappersloggbok. Logga in och öppna **Mata in serier** i menyn till vänster.

## Fyll i passet

Fälten är telefonens formulär för nytt pass: typ, loggning, reglemente, gren,
matchupplägg, datum och tid, namn och plats, sedan tävlingsfälten, vapen och
ammunitionsparti. Datum och tid är när du sköt, i datorns tidszon; båda börjar
på nu. Ett datum före 1900 eller senare än i morgon avvisas, som ett skrivfel
snarare än ett pass.

Datum och tid visas i appens format, utifrån dess språk och webbläsarens
region, oavsett vilket språk webbläsaren själv har: `2026-09-22` och `18:00` på
svenska, `09/22/2026` och `6:00 PM` på amerikansk engelska. Skriv dem på samma
sätt; vilket skiljetecken som helst går bra, ett datum med året först, som
`2026-09-22`, förstås alltid, och året skrivs med fyra siffror. En tid kan också
skrivas som `1800`, `18` eller `6 pm`. Det som inte är ett datum eller en tid
markeras under fältet med formatet att använda. Kalenderknappen bredvid datumet
öppnar webbläsarens egen datumväljare och fyller i datumet du väljer.

Klass och ISSF-gren utgår från profilen du har angett under **Inställningar →
Personligt** i telefonen, som synken för över till kontot: födelseår, klass
och brytaren för damklasser. Din egen klass är förvald och står först, och de
grenar du får delta i kommer först, som i telefonen. Utan profil är ingenting
förvalt. Reglementena du har slagit på och **Inställningar → Valfria fält**
stannar i telefonen, så webben erbjuder alla reglementen och frågar alltid
efter vapengrupp och klass i en tävling. Se
[Vapengrupp och klass](../reference/weapon-group-and-class.md).

## Bara antal skott

Välj **Bara antal skott** under **Loggning** för att föra in hur många skott
du sköt, utan serier. Passets fält finns kvar; **Avlossade skott** ersätter
matchupplägget och serieraderna. Lämna fältet tomt om du inte vet antalet.
Annat än ett heltal från 0 till 10 000 avvisas innan något skickas; telefonen
tar samma intervall.

## Skriv serierna

En rad per serie. Skriv skotten med mellanslag emellan:

| Skriv      | Betyder                    |
| ---------- | -------------------------- |
| `0` – `10` | ringvärdet                 |
| `X`        | en innertia (X), värd 10   |
| `10.4`     | decimalräkning: 10,4       |
| `X.6`      | decimalräkning: inner 10,6 |

`x` fungerar lika bra som `X`, och `10,4` lika bra som `10.4`. Med
decimalräkning behöver varje skott sin tiondel: skriv `9.0` för en nia, `0.0`
för en bom och `X.0` för en innertia på linjen; en ensam `9` eller `X`
avvisas, och meddelandet säger varför. Varje rad visar sin summa och sina
innertior medan du skriver.

Ett pass behöver minst ett skott eller foto: är alla rader tomma säger **Spara** det och
skickar ingenting.

- **Enter** går till nästa rad; i fritt format lägger Enter i sista raden till en rad.
- **Tab** och **Skift+Tab** flyttar mellan fälten, **Provserie** inräknad.
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

## Mata in fältskjutning

Välj **Fältskjutning** som gren, så blir raderna stationer, som i telefonen.
**Resultatform** avgör om resultatet visas som träff och figurer (**Fält**)
eller som en summa (**Poängfält**).

Varje station har telefonens stationsfält: **Träff**, **Träffade figurer**,
**Figurer** (hur många som var utställda), var och en med **−** och **+**,
**Poäng** och **Maxpoäng** för ett
poängmål, och **Struken**. Träffade figurer erbjuder bara det som träffen och
figurerna tillåter. Summan ovanför stationerna räknar de stationer som sparas
och utelämnar strukna stationer och särskjutning, som i telefonen. **Lägg till
station** lägger till en rad.

När en station har något ifyllt gör **Starta särskjutning** nästa station
till en särskjutningsstation, märkt **Särskjutning**. Från den första ifyllda
särskjutningsstationen och framåt är varje station en särskjutningsstation. En
särskjutningsstation där inget är ifyllt sparas inte och startar inte
särskjutningen.

**Träff** börjar på **–**. En station där inget är ifyllt sparas inte, och
stationerna efter den flyttas upp ett nummer. För en station där alla skott
missade stegar du Träff till **0** med **+**: den sparas och räknas, som en station med
0 träff.

## Lägg till ett foto av tavlan

**Lägg till foto** under en rad lägger till ett foto av seriens tavla, från en
fil på datorn. En rad med foto sparas även utan skott, så att du kan
poängsätta den från fotot i telefonen senare. Med **Byt foto** och **Ta bort**
ändrar du det innan du sparar.

Fotot skickas som telefonen skickar ett: förminskat (högst 2048 pixlar på den
längre sidan), vänt rätt och sparat som en ny JPEG, utan de kamerauppgifter och
den plats originalet kan bära på. Originalfilen lämnar aldrig datorn. En fil
som webbläsaren inte kan öppna som bild (HEIC, utom i Safari) avvisas, liksom
ett foto som fortfarande är större än 1,5 MB när det förminskats. En station i fältskjutning tar inget foto.

## Tagga det

Under raderna tar **Taggar** ett taggnamn: skriv det och tryck **Lägg till**
eller Enter. Kontots taggar föreslås medan du skriver; ett namn du inte använt
förut blir en ny tagg, som i telefonen. Stora och små bokstäver spelar ingen
roll: finns taggen `KM` lägger `km` till `KM`. Klicka på en tagg för att ta
bort den igen. Text som står kvar i fältet när du sparar läggs inte till.

## Spara

**Spara** skickar hela passet på en gång, taggarna med; det sparas antingen
helt eller inte alls. Telefonen får det vid nästa synk, och ett valt vapens
skottantal ökar med skotten, provserier och final inräknade, eller med de
avlossade skotten; för fältskjutning med sex för varje sparad station, strukna
stationer och särskjutning inräknade. Fotona skickas först, och passet först när alla foton har
kommit fram; telefonen hämtar dem som vilka synkade foton som helst.

Går ett foto inte att skicka sparas ingenting. Går servern inte att nå, eller
har fler än 60 foton skickats den senaste timmen, blir **Spara** till
**Försök igen**, som bara skickar de foton som inte kommit fram och sedan
passet. Är fotolagringen full tar du bort ett foto och sparar igen: foton som
redan kommit fram skickas inte igen. Ett foto som kom fram innan ett sparande
misslyckades ligger kvar i fotolagringen om du sedan tar bort det eller stänger
fliken.

En rad med foto finns kvar när du byter matchupplägg, som en rad med skott.

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

Hur du ändrar eller tar bort ett pass i efterhand står i
[Ändra ett pass på webben](editing-a-session-on-the-web.md).
