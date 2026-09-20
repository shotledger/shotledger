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

## Rapporten

- **Rekord** inom det filtrerade urvalet: bästa passresultat, flest innertior,
  flest tior. Tryck på ett för att öppna passet det kom från.
- **Totaler**, både som summor (alla poäng, alla skott) och som snitt per skott
  och per serie.
- **Diagram** över tid, en punkt per pass, plus träffbilden.
- **Export** som PDF eller JSON. JSON-filen bär med sig filtret —
  provserieinställningen inräknad — vid sidan av siffrorna.
