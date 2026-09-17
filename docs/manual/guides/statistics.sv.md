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
| **Provserier**      | Om provserier räknas med. Se nedan.                                                                |
| **Gren**            | En gren, eller alla.                                                                               |
| **Skott per serie** | Bara serier av den längden, så att femskottsserier och sexskottsserier aldrig blandas i ett snitt. |
| **Etiketter**       | Pass som har någon av de etiketter du väljer.                                                      |

Rapporten upprepar alla filter högst upp, så en rapport du exporterat eller
återvänt till säger fortfarande vad den handlar om.

## Provserier räknas här — om du inte säger annat

Inuti ett pass räknas en [provserie](logging-a-session.md#provserier) aldrig. Den
är inte en del av dagens resultat, och passets total, seriesnittet och passets
egen statistikflik utelämnar den alla.

Utanför ett pass gäller något annat: **en provserie är en vanlig serie**. Över
månader av skytte är en provserie bara mer skytte — den gick genom samma vapen
mot samma tavla — så rapporten räknar med den i snitten, standardavvikelsen,
träffbilden och rekorden.

Ställ **Provserier** på **Räkna inte med** så utelämnas de igen, och då stämmer
varje siffra med det varje pass visar på sin egen sida.

Två saker ändrar sig inte:

- **Loggade skott** räknas alltid med provserier, i båda lägena. Du sköt de
  skotten oavsett vad serien kallades, och siffran måste stämma med vapnets
  skotträknare och din ammunitionsåtgång.
- Antalet **guldserier** räknar alltid med en provserie, i båda lägena. En
  femtia på en provserie ger märket precis som vilken annan serie som helst, så
  filtret har inget att säga till om där.

!!! note "Rekord kan komma från en provserie"

    Med **Räkna med** valt kan ett bästa passresultat eller ett rekord i antal
    innertior sättas av ett pass provserie — så rapportens bästa passtotal kan
    visa mer än passets egen sida gör. Välj **Räkna inte med** om du vill att
    rekorden ska betyda exakt det passsidorna betyder.

## Rapporten

- **Rekord** inom det filtrerade urvalet: bästa passresultat, flest innertior,
  flest tior. Tryck på ett för att öppna passet det kom från.
- **Totaler**, både som summor (alla poäng, alla skott) och som snitt per skott
  och per serie.
- **Diagram** över tid, en punkt per pass, plus träffbilden.
- **Export** som PDF eller JSON. JSON-filen bär med sig filtret —
  provserieinställningen inräknad — vid sidan av siffrorna.
