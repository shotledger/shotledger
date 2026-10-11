# Logga ett pass

Ett pass är ett banbesök med ett vapen. Inuti passet ligger serier, och inuti
serierna ligger skott.

## Passets huvud

Överst i ett pass står namnet, och därunder på en rad datumet det sköts, typen,
din vapengrupp och klass, vapnet och tävlingen. Dina anteckningar följer under.
Bådadera betyder mest för ett pass du inte fyllt i själv: en import bär med sig
sitt eget datum och lägger sin förklaring — vilket vapen, varför ett pass är
flaggat för granskning — i anteckningarna.

Anteckningar rymmer upp till 2 000 tecken och övriga textfält färre, så att
varje post förblir liten nog att synka. Om synken någon gång säger att en post
är för stor — en importerad anteckning kan vara längre än appen låter dig
skriva — kortar du postens anteckningar så fortsätter synken.

Under det ligger passets etiketter. Etiketter som appen skrivit åt sig själv ser
ut som `shotlog:review` eller `shotledger:championship`, med ett prefix och ett
kolon; de visas här men utelämnas på start- och loggbokslistorna, där dina egna
etiketter annars trängs undan. Du kan fortfarande filtrera loggboken på dem.

## Att byta matchupplägg

Valde du hela matchen när du menade fritt format, eller tvärtom:

1. Öppna passets **⋮**-meny och välj **Redigera pass**.
2. Välj upplägg under **Matchupplägg** och tryck **Spara ändringar**.

Serierna läggs upp på nytt för det nya upplägget, och därför går det bara fram
till första resultatet: ett skott, ett foto som väntar på att poängsättas eller
en importerad summa. Därefter visar raden upplägget med en notering om att det
inte längre går att ändra.

## Serier och skott

En **serie** är en omgång skott som räknas ihop — fem skott i SPSF:s precision,
sex i militär snabbmatch. Ett **skott** är ett hål, värt hela poäng eller
decimaler beroende på program.

Tryck på en serie för att fylla i den. Knappsatsen går vidare efter varje skott,
så du behöver inte sträcka dig efter någon "nästa"-knapp mellan skotten.

I precision, magnumprecision och militär snabbmatch markerar knappsatsen en bra
serie när du fyller i sista skottet. Når serien guldseriegränsen blir summan
guldfärgad och telefonen ger en lätt vibration. Alla skott i tian — 50 i en
femskottsserie — ger guldringar och **Bra jobbat!** En **perfekt serie** går
ett steg längre: bara innertior, eller 10,9 med decimalräkning (54,5), och ger
**Perfekt serie!** Det visas bara när du fyller i serien, aldrig när du öppnar
en sparad, och med telefonens inställning för minskade rörelser ser du bara
texten. I passets serielista visas summan för en serie med full poäng på guld, med en
extra ring för en perfekt serie.

## Provserier

Markera en serie som **provserie** i seriemenyn, så slutar den räknas mot
passets total. Resultatet visas ändå, med en asterisk — **45\*** — eftersom en
provserie medvetet inte räknas men det du sköt fortfarande är värt att se.

Så är regeln inuti ett pass. Mellan pass gäller något annat — se
[Hur provserier räknas](../explanation/how-sighters-count.md).

## Fältskjutning

Fältskjutning räknas inte i ringar, så den loggas i **stationer** i stället
för serier. Välj **Fältskjutning** som gren (på engelska _Field Shooting_) så
ställer passet en extra fråga: om tävlingen skjuts som **fält** eller
**poängfält**. Ett fältpass har inga knappar för tidtagarur eller sikte.

Varje station är sex skott. På en skärm trycker du **Träff** (0–6),
**Träffade figurer** och **Figurer**, hur många figurer stationen hade. Fem
träff i tre av fyra figurer skrivs **5/3 av 4**: du missade ett skott eller
satte två i samma figur, och en figur blev orörd. Låt Figurer stå på **–** om du
inte vet; stationen skrivs då **5/3**. Passets resultat visar
"26 (30) träff / 22 figurer": dina träff, med möjliga träff — sex per station —
inom parentes. Strukna stationer och särskjutning räknas inte. I poängfält är
det i stället en summa, där varje träff ger en poäng och varje träffad figur
ytterligare en. När varje station har sina figurer ifyllda räknas de ihop på
samma sätt: "26 (30) träff / 22 (24) figurer". Hem, passlistan och Rekord
visar resultatet på samma sätt.

Där arrangören satt ut en **ringad figur** skriver du poängen du fick under
**Poäng**, och vad figuren var värd efter "av" om du vet det. En station med
poäng skrivs **6/3 av 4, 12p av 20p**. Lämna Poäng tomt på en station utan
ringad figur. Fältskjutning har inget
fast ringsystem — arrangören väljer — så appen frågar i stället för att anta.
Poängen läggs aldrig till resultatet; de skiljer bara två skyttar som annars
är lika.

Två slags stationer ligger kvar i ronden utan att räknas i resultatet:

- **Struken** — stationen annullerades, för ett regelbrott eller ett
  säkerhetsfel. Det får du veta efteråt, så reglaget finns på stationen när du
  öppnar den igen för att ändra den, inte när du först matar in den. Den ligger
  kvar i ronden, överstruken, och räknas inte.
- **Särskjutning** — skjuts för att skilja lika resultat. Den avgör placering,
  aldrig det resultat du noterat. Tryck **Starta särskjutning** under
  stationerna: nästa station, och varje station du lägger till efter den, är en
  särskjutningsstation, så som **Starta final** fungerar i ett ringpass.

Båda räknar ändå de sex skotten mot vapnets skotträknare och din ammunition,
eftersom du sköt dem.

## Att ändra ordning

Serier går att dra till en annan ordning. Håll ned en serie och dra: raden
lyfter sig över de andra och listan visar var den kommer att hamna.

Det finns därför att man inte alltid fyller i serierna i den ordning man sköt
dem — en serie som fylls i sent hör hemma där den skedde, inte sist.

## Att ta bort en serie

Svep en serie åt vänster så visas papperskorgsikonen, och tryck på den. Du får
bekräfta innan serien och dess skott tas bort.

## Tidtagaruret och siktet

Två knappar sitter ovanför serielistan (inte i ett fältpass):

- **Tidtagarur** — öppnas ovanpå passet. Det fortsätter gå när du stänger det,
  eftersom det tar tid på ditt pass och inte på panelen. Knapparna fungerar
  som ett stoppur i telefonen: **Varv** och **Starta**, sedan **Varv** och
  **Stoppa** medan det går, och **Nollställ** och **Återuppta** när det är
  stoppat. Varven listas under knapparna, det senaste först.
- **Sikte** — siktesinställningarna för passets vapen, så att du kan anteckna
  en justering mellan serier utan att lämna passet.

Båda är knappar snarare än fasta paneler: gott om skyttar har med sig en egen
timer, och en panel som ingen använder är en panel som trycker ut serielistan
från skärmen.

## Vad sammanställningen säger

Under serielistan:

| Siffra              | Vad den betyder                                                |
| ------------------- | -------------------------------------------------------------- |
| **Total**           | Alla räknande serier hopsummerade. Provserier räknas inte med. |
| **Snitt per serie** | Medelpoängen per serie, för att jämföra pass av olika längd.   |
| **Innertior**       | Hur många skott som hamnade i innertian.                       |
| **Innertiosnitt**   | Innertior per serie.                                           |

I ett mästerskapsformat delas totalen upp i **före final** och **final**,
eftersom de bedöms var för sig.

## Nationell helmatch

**Hela matchen** i nationell helmatch kommer som tre delmoment om fyra serier:
**A · Precision** på precisionstavlan, **B · Snabbskjutning** på
snabbskjutningstavlan och **C · Figurskjutning** på figurtavlan med 18, 16, 14
och 12 sekunder. Före A och före B finns en provserie, före C ingen. Totalen är
högst 600, 200 för varje delmoment.

Under sammanställningen visar **Per delmoment** varje delmoment på en egen rad:
hur många av dess serier som räknas, dess total och dess snitt per serie.
Provserier räknas aldrig, och ett delmoment du inte skjutit än visar 0 och ett
streck. Ett program utan delmoment visar den inte.

När två av dina helmatchresultat är lika går högst C före, därefter högst B —
regelbokens ordning. A används aldrig. Rekord och statistikrapportens bästa
pass följer den.

Standardmedaljen i helmatch avgörs bara av placering: silver till bästa
niondelen av fältet, brons till bästa tredjedelen, per vapengrupp. Ett enskilt
pass kan inte räkna ut det, så för en tävling anger du medaljen som
resultatlistan ger: **Redigera pass → Officiell standardmedalj**. Den visas
sedan under passets rubrik.

Figurtavlan räknas bara med knappsatsen. **Figurskjutning** som egen gren är
delmoment C som träningspass: fyra serier, ingen provserie och egen statistik.

## Foton

Vilken serie som helst kan bära ett foto av sin tavla. En serie med foto visar
en kameraikon; tryck på den för att se bilden. Där räknar **⋮ → Poängsätt från
det här fotot** serien ur fotot — se [Räkna från foto](scoring-from-a-photo.md).

Varje foto du tar dyker också upp i galleriet under **Verktyg → Foton**, där du
kan filtrera på gren, vapen och vapengrupp. Håll fingret på ett foto för att
dela, kopiera eller spara det.

Ett foto vars fil inte längre finns på telefonen visas som saknat, i galleriet
och på sin serie. **Byt foto** på serien lägger till det igen.

## Passrapport

**⋮ → Passrapport** gör en PDF av passet och lämnar över den till
delningsrutan, för att skriva ut eller skicka till en tränare. Överst står
datum, gren och vapen, sedan en sammanfattning av passet: samma resultat som
passvyn visar (totalt, snitt per serie, innertior och eventuella delsummor),
skottfördelningen, och alla hål från serierna räknade från foto på en tavla,
med gruppens sidled, höjdled, medelradie och största spridning. Från 20 hål
står en värmekarta över samma hål bredvid, som i passvyn. Provserier räknas
inte med i sammanfattningen. Har bara några serier foto står det under
tavlan hur många den visar.

Under sammanfattningen visas serierna sida vid sida, tre per rad: varje series
summa och skottvärden och, för en serie räknad från foto, dess egen tavla och
gruppmått. En serie inmatad med knappsatsen visar bara värdena. Provserier och
finalserier är märkta.

Rapporten är på appens språk. Fältskjutningspass har ingen: de räknas i
träffar på figurer, utan ringar att rita.

## Att dela eller ta bort ett pass från Hem

På Hem sveper du ett pass åt vänster så visas två ikoner: dela och papperskorg.
Du får bekräfta innan ett pass tas bort.

## Att hitta ett pass igen

Startsidan visar dina tio senaste pass. **Visa alla**, sist i den listan, öppnar
hela loggboken — varje pass du någonsin loggat, nyast först. Den ligger längst
ned för att det är där du är när de tio senaste inte innehöll det du letade
efter.

Loggboken öppnas på själva passen. Sökrutan ligger ovanför dem; allt annat är
hopfällt bakom en enda **Filter**-rad, som visar vad som just nu smalnar av
listan — så att ett filter aldrig arbetar på dig i det dolda, och du aldrig
rullar förbi sex reglage för att nå en tävling för några veckor sedan.

Filtrera på valfri kombination av:

- **namn** — fritext som bortser från versaler och accenter, så _traning_
  hittar _Träning_
- **när** — senaste 30 dagarna, 6 eller 12 månader, allt, eller två egna datum.
  Samma val som fliken [Statistik](statistics.sv.md) erbjuder, för det är samma
  fråga
- **träning eller tävling**
- **gren**
- **etikett**
- **vapen**, inklusive _Inget vapen angivet_ för pass där inget angetts

Filtren smalnar av tillsammans, de vidgar inte: sätter du både _Tävling_ och
_Milsnabb_ visas de pass som är bådadera. Antalet ovanför listan säger alltid
hur många av dina totalt du tittar på, så ett filter som knappt matchar något
syns som just det i stället för att se ut som en tom loggbok.
