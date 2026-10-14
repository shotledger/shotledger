# Statistik

Fliken **Statistik** öppnar på dina resultat. Appen räknar fram dem ur dina
pass varje gång du tittar, för filtret högst upp. Ingenting sparas, så du kan
ställa en annan fråga hur ofta du vill.

## Det fliken visar först

Under rubriken anger en rad perioden och hur många pass den rymmer:
_Senaste 6 månaderna · 22 pass_. Sedan:

- **Snitt per serie**, med stor stil. Under det hur snittet rört sig mot den
  lika långa perioden närmast före: _+0.8 mot de föregående 6 månaderna_.
  Den tidigare perioden behåller alla andra filter du valt. Med **Max** finns
  ingen tidigare period, och då ingen rad; finns inga poängsatta serier i den
  tidigare perioden står det att det inte finns något att jämföra med. Under
  siffran ett diagram över snittet per serie över tid.
- **Snitt/skott**, **Standardavvikelse per skott** (spridningen mellan
  enskilda skott), **X %** och **Innertior**. Antalet X visas alltid, även
  när det är 0.
- **Fördelning**: hur många skott som gav varje ringvärde, med antalet
  poängsatta skott och innertior under. Ett X räknas som en tia här.
- **Pass**, **Loggade skott** och **Tävlingar** för filtret. Startsidan
  visar inte längre de här antalen; med **Max** och inga andra filter är de
  dina totaler för all tid.

Väljer du _Fältskjutning_ som gren börjar fliken i stället med
**Träffandel** och ett diagram över träffar per station, eftersom inget
ringvärde säger något om en fältomgång.

Knappen **Rekord** bredvid rubriken öppnar dina personbästa och jämförelser
år för år. **Jämför partier**, längst ner på fliken, jämför ammunitionspartier.

## Filtren

**Filter** högst upp öppnar ett blad med filtren. En ändring gäller direkt;
**Stäng** tar dig tillbaka till resultaten. Varje filter som inte står på sitt
standardvärde ligger bredvid knappen som en bricka, till exempel _Tävling_
eller _Precision_. Tryck på en bricka för att ta bort det filtret, eller
använd **Rensa alla** i bladet. Rensningen lämnar perioden som den är.

| Filter              | Vad det gör                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Pass**            | Datumintervallet: senaste 30 dagarna, 6 eller 12 månader, all tid (**Max**), eller två egna datum. |
| **Typ av pass**     | Träning, tävling eller båda.                                                                       |
| **Provserier**      | Om provserier räknas med. Se [Hur provserier räknas](../explanation/how-sighters-count.sv.md).     |
| **Gren**            | En gren, eller alla.                                                                               |
| **Skott per serie** | Bara serier av den längden, så att femskottsserier och sexskottsserier aldrig blandas i ett snitt. |
| **Taggar**          | Pass som har någon av de taggar du väljer.                                                         |

Antalet pass är varje pass filtret träffade, även ett pass du loggat som
antal skott utan serier. De skotten finns med i totalerna också. Ett
fältpass stationer räknas som sex skott var, även strukna stationer och
särskjutningsstationer, eftersom de skotten avlossades. Ett ringpass
särskjutningsserier räknas på samma sätt med i de avlossade skotten, och i
inget resultat.

Filtren ligger kvar som du lämnade dem medan du rör dig i appen. Kommer du
tillbaka till fliken börjar den från toppen igen.

## Resten av resultaten

Under antalen listar **I rapporten** delarna längre ner, var och en med
frågan den svarar på. Tryck på en för att gå direkt dit.

- **Sammanfattning**: rekorden inom det filtrerade urvalet, bästa
  passresultat, flest innertior och flest tior. Tryck på ett för att öppna
  passet det kom från.
- **Summa för hela filtret**: totalpoäng, serier, tior, och guldserierna när
  det finns några.
- **Fältskjutning** (på engelska _Field Shooting_), när resultaten innehåller
  fältpass: stationer, träffar, träffade figurer, träffandelen (träffar av sex
  per station) och ett diagram över träffar per station över tid. Bara
  stationer som räknas finns med; en struken station eller en
  särskjutningsstation är inte del av ett resultat.
- **Träning mot tävling**, när **Typ av pass** står på _Alla_: träning och
  tävling sida vid sida, med pass, medel, median, bästa, std.avv. och snitt X
  per serie, och en rad om hur långt över eller under träningen tävlingen
  ligger. Lika jämförs med lika: en tabell per gren och serielängd, och bara
  där både träning och tävling har serier. Den räknar samma serier som resten
  av resultaten, så inställningen för provserier gäller.
- **Provserie och resultat**, utom när **Typ av pass** står på _Träning_:
  varje tävlings provserie mot dess match, en punkt per tävling och ett kort
  per gren. Från 10 tävlingar säger det om en bättre provserie hänger ihop med
  en bättre match, och hur starkt. Se
  [Hur provserier räknas](../explanation/how-sighters-count.md#forutsager-provserien-matchen).
- **Diagram över tid**: snittpoäng per skott och passresultat, en punkt per
  pass.
- **Var dina skott hamnar**, när pass i resultaten räknats från foto: deras
  hål på en värmekarta, med en rad om huruvida poängen du tappar mest är en
  siktjustering eller mest spridning. Se
  [Vad träffbildens siffror betyder](../explanation/group-figures.md#over-flera-pass).
- **Exportera JSON**: de matchade passen och sammanfattningen som data. Filen
  bär med sig filtret, provserieinställningen inräknad, vid sidan av
  siffrorna.

Varje diagram över tid ger varje gren **en egen linje**, namngiven i
teckenförklaringen under. Ett precisionspass går till 350 och ett milsnabbpass
till 600, så en linje för båda vore en sågtandskurva som inte säger något om
någondera. Den vågräta axeln är verklig tid, inte ett steg per pass: pass som
delar datum ligger ovanpå varandra, och etiketterna anger året så snart
perioden korsar ett årsskifte. Bortom åtta grenar säger diagrammet hur många
det utelämnat i stället för att ge två av dem samma färg. Axelns siffror går i
jämna steg (40, 42, 44); antalsaxeln i **Fördelning** börjar på noll.

Ett filter på **Skott per serie** utelämnar fältpass: en fältomgång har
stationer, inte serier, och har alltså ingen serielängd att matcha.

## Ett pass mot din vanliga form

Öppna ett pass och byt från **Serier** till **Statistik**. Under passets egna
siffror ställer **Mot din vanliga form** passet mot de 100 serier du sköt före
det i samma gren och klass. Provserier räknas inte på någon sida.

- En rad i ord säger hur passet gick: _Ungefär som vanligt_, _Bättre än
  vanligt_, _Klart bättre än vanligt_, eller samma sak åt det sämre hållet. Se
  [Hur "vanlig form" räknas fram](../explanation/usual-form.md).
- **Snitt/serie** och **Snitt/skott** har var sin stapel. Det grå strecket är
  ditt vanliga snitt och det färgade är dagens; ju längre isär de står, desto
  längre från det vanliga sköt du. Raden under ger båda siffrorna och
  skillnaden.
- **Förväntat resultat** är vad ditt vanliga seriesnitt blir över så många
  serier som du sköt i dag, bredvid vad du faktiskt fick.
- **Andel tior** och **Nior eller bättre** ger andelen av dagens skott i
  varje, din vanliga andel och skillnaden mellan dem.

Med färre än 100 tidigare serier används de som finns, och det står hur många.
Under 20 visas siffrorna ändå, men inte hur ovanligt passet var. Finns inga
alls står det att det inte finns något att jämföra med än.

## På webben

Med synk påslagen visar **Statistik** i webbappen samma resultat med samma
siffror, i samma ordning: snittet per serie med sin trend och sitt diagram
först, sedan detaljerna, fördelningen och antalen. Filterraden står kvar
högst upp på sidan när du rullar, med perioden och antalet pass i slutet.
**Filter** öppnar samma filter, taggar inräknade, och en bricka tar bort ett,
precis som i telefonen. Filtren står kvar som du lämnade dem medan du byter
sida i webbappen, och börjar om när du loggar ut eller stänger fliken. Ett
rekords passnamn öppnar passet. Statistikvyn i ett pass, med **Mot din
vanliga form**, finns bara i telefonen.

Ovanför rapporten står din status för skjutaktivitet, när en profil är vald;
se [Skjutaktivitet](license-activity.md#pa-webben).

Webben har ingen **Exportera JSON** och ingen värmekarta för **Var dina skott
hamnar**; använd telefonen för dem. Ett eget intervall där **Från** ligger
efter **Till** matchar ingenting, och sidan säger det. Dess datum skrivs som i
[Mata in serier](entering-series-on-the-web.md) eller väljs med
kalenderknappen.
