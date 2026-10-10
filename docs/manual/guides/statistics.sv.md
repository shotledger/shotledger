# Statistik

Fliken **Statistik** är ett formulär, inte en instrumentpanel. Du beskriver
vilket skytte du vill titta på, trycker på **Skapa rapport**, och appen räknar
fram siffrorna där och då. Ingenting sparas, så du kan ställa en annan fråga hur
ofta du vill.

## Filtren

| Filter              | Vad det gör                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Pass**            | Datumintervallet — senaste 30 dagarna, 6 eller 12 månader, all tid, eller två egna datum.          |
| **Typ av pass**     | Träning, tävling eller båda.                                                                       |
| **Provserier**      | Om provserier räknas med. Se [Hur provserier räknas](../explanation/how-sighters-count.sv.md).     |
| **Gren**            | En gren, eller alla.                                                                               |
| **Skott per serie** | Bara serier av den längden, så att femskottsserier och sexskottsserier aldrig blandas i ett snitt. |
| **Etiketter**       | Pass som har någon av de etiketter du väljer.                                                      |

Rapporten upprepar alla filter högst upp, så en rapport du exporterat eller
återvänt till säger fortfarande vad den handlar om.

Antalet ovanför rapporten är varje pass filtret träffade, även ett pass du
loggat som antal skott utan serier — de skotten finns med i totalerna också.
Ett fältpass stationer räknas som sex skott var, även strukna stationer och
särskjutningsstationer, eftersom de skotten avlossades. Det stämmer därför med
antalet pass på startsidan.

Filtren ligger kvar som du lämnade dem. Lämna fliken och kom tillbaka, så är
formuläret fortfarande det du byggde — det rullar upp till toppen så att du ser
det, med eventuell öppen väljare stängd.

## Rapporten

Under filtret listar **I rapporten** de delar som rapporten innehåller, var
och en med frågan den svarar på. Tryck på en för att gå direkt dit.

- **Rekord** inom det filtrerade urvalet: bästa passresultat, flest innertior,
  flest tior. Tryck på ett för att öppna passet det kom från.
- **Totaler**, både som summor (alla poäng, alla skott) och som snitt per skott
  och per serie.
- **Diagram** över tid, en punkt per pass, plus träffbilden. Varje gren får
  **en egen linje**, namngiven i teckenförklaringen under diagrammet. Ett
  precisionspass går till 350 och ett milsnabbpass till 600, så att rita dem som
  en linje gav en sågtandskurva som inte sa något om någondera. Den vågräta
  axeln är verklig tid, inte ett steg per pass — pass som delar datum ligger
  ovanpå varandra, vilket är sanningen om dem — och etiketterna anger året så
  snart perioden korsar ett årsskifte. Bortom åtta grenar säger diagrammet hur
  många det utelämnat i stället för att ge två av dem samma färg.
- **Fältskjutning** (på engelska _Field Shooting_), när rapporten innehåller fältpass: stationer, träffar,
  träffade figurer, träffandelen (träffar av sex per station) och ett diagram
  över träffar per station över tid. Bara stationer som räknas finns med — en
  struken station eller en särskjutningsstation är inte del av ett resultat.
  Väljer du _Fältskjutning_ som gren utelämnas ringkorten ovan, eftersom inget
  av dem kan säga något om en fältomgång.
- **Träning mot tävling**, när **Typ av pass** står på _Alla_: träning och tävling
  sida vid sida, med pass, medel, median, bästa, std.avv. och snitt X per
  serie, och en rad om hur långt över eller under träningen tävlingen ligger.
  Lika jämförs med lika: en tabell per gren och serielängd, och bara där både
  träning och tävling har serier. Den räknar samma serier som resten av
  rapporten, så inställningen för provserier gäller.
- **Provserie och resultat**, utom när **Typ av pass** står på _Träning_:
  varje tävlings provserie mot dess match, en punkt per tävling och ett kort
  per gren. Från 10 tävlingar säger det om en bättre provserie hänger ihop med
  en bättre match, och hur starkt. Se
  [Hur provserier räknas](../explanation/how-sighters-count.md#forutsager-provserien-matchen).
- **Var dina skott hamnar**, när pass i rapporten räknats från foto: deras hål
  på en värmekarta, med en rad om huruvida poängen du tappar mest är en
  siktjustering eller mest spridning. Se
  [Vad träffbildens siffror betyder](../explanation/group-figures.md#over-flera-pass).
- **Exportera JSON**: de matchade passen och sammanfattningen som data. Filen
  bär med sig filtret — provserieinställningen inräknad — vid sidan av
  siffrorna.

Ett filter på **Skott per serie** utelämnar fältpass: en fältomgång har
stationer, inte serier, och har alltså ingen serielängd att matcha.
