# Logga ett pass

Ett pass är ett banbesök med ett vapen. Inuti passet ligger serier, och inuti
serierna ligger skott.

## Passets huvud

Överst i ett pass står namnet, och därunder på en rad datumet det sköts, typen,
din vapengrupp och klass, vapnet och tävlingen. Dina anteckningar följer under.
Bådadera betyder mest för ett pass du inte fyllt i själv: en import bär med sig
sitt eget datum och lägger sin förklaring — vilket vapen, varför ett pass är
flaggat för granskning — i anteckningarna.

Under det ligger passets etiketter. Etiketter som appen skrivit åt sig själv ser
ut som `shotlog:review` eller `shotledger:championship`, med ett prefix och ett
kolon; de visas här men utelämnas på start- och loggbokslistorna, där dina egna
etiketter annars trängs undan. Du kan fortfarande filtrera loggboken på dem.

## Serier och skott

En **serie** är en omgång skott som räknas ihop — fem skott i SPSF:s precision,
sex i militär snabbmatch. Ett **skott** är ett hål, värt hela poäng eller
decimaler beroende på program.

Tryck på en serie för att fylla i den. Knappsatsen går vidare efter varje skott,
så du behöver inte sträcka dig efter någon "nästa"-knapp mellan skotten.

## Provserier

Markera en serie som **provserie** i seriemenyn, så slutar den räknas mot
passets total. Resultatet visas ändå, med en asterisk — **45\*** — eftersom en
provserie medvetet inte räknas men det du sköt fortfarande är värt att se.

Så är regeln inuti ett pass. Mellan pass gäller något annat — se
[Hur provserier räknas](../explanation/how-sighters-count.md).

## Fältskjutning

Fältskjutning räknas inte i ringar, så den loggas i **stationer** i stället
för serier. Välj **Fältskjutning** som gren — namnet står kvar på svenska även när appen
körs på engelska, eftersom det är så regelboken kallar grenen — så ställer
passet en extra fråga:
om tävlingen skjuts som **fält** eller **poängfält**.

Varje station är sex skott, och du noterar två tal — träffar, och hur många
figurer träffarna hamnade i. Fem träff i tre figurer skrivs **5/3**: du
missade ett skott, eller satte två i samma figur. Passets resultat visar
"26 träff i 22 figurer", eller en summa i poängfält, där varje träff ger en
poäng och varje träffad figur ytterligare en.

Där arrangören satt ut en **ringad figur** slår du på _Ringad figur_ och
noterar poängen du fick och vad figuren var värd. Fältskjutning har inget
fast ringsystem — arrangören väljer — så appen frågar i stället för att anta.
Poängen läggs aldrig till resultatet; de skiljer bara två skyttar som annars
är lika.

Två reglage tar bort en station ur resultatet utan att radera den:

- **Struken** — stationen annullerades, för ett regelbrott eller ett
  säkerhetsfel. Den ligger kvar i ronden, överstruken, och räknas inte.
- **Särskjutning** — skjuts för att skilja lika resultat. Den avgör placering,
  aldrig det resultat du noterat.

Båda räknar ändå de sex skotten mot vapnets skotträknare och din ammunition,
eftersom du sköt dem.

## Att ändra ordning

Serier går att dra till en annan ordning. Håll ned en serie och dra: raden
lyfter sig över de andra och listan visar var den kommer att hamna.

Det finns därför att man inte alltid fyller i serierna i den ordning man sköt
dem — en serie som fylls i sent hör hemma där den skedde, inte sist.

## Tidtagaruret och siktet

Två knappar sitter ovanför serielistan:

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

## Foton

Vilken serie som helst kan bära ett foto av sin tavla. En serie med foto visar
en kameraikon; tryck på den för att se bilden, och därifrån kan du räkna serien
ur fotot — se [Räkna från foto](scoring-from-a-photo.md).

Varje foto du tar dyker också upp i galleriet under **Verktyg → Foton**, där du
kan filtrera på gren, vapen och vapengrupp.

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
