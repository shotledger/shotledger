# Webshooter

[Webshooter.se](https://webshooter.se/) är SPSF:s tävlingssystem — anmälningar,
startlistor och officiella resultat. ShotLedger kan läsa dina egna uppgifter
därifrån.

**Inställningar → Externa webbplatser → Webshooter.** Slå på det, och anslut
sedan. Den dyker upp under Verktyg när den är påslagen, och om du inte har
loggat in än länkar den skärmen tillbaka hit.

## Att ansluta

Två sätt:

- **Ditt Webshooter-lösenord.** Skickas en gång, direkt från telefonen till
  webshooter.se, och sparas aldrig. Bara den token som returneras behålls, i
  telefonens säkra lagringsutrymme.
- **En personlig API-token**, inklistrad, om du har en.

Ingenting går via någon ShotLedger-server. Det finns över huvud taget ingen
ShotLedger-server i den här vägen.

När anslutningen är klar tar appen fram ditt **skyttekortsnummer**, som är det
som skiljer dina anmälningar och resultat från allas andras.

## Mina starter

**Verktyg → Webshooter → Mina starter** listar varje kommande tävling du anmält
dig till — även sådana där patrullerna ännu inte lottats.

Varje start visar patrull, skjutplats, vapenklass och plats. Tryck på tävlingen
för att se klubbkamraternas starttider; tryck på själva starten för att se hela
din patrull, med din egen rad markerad.

### Att lägga en start i kalendern

**Lägg till i kalender** skriver in starten i den kalender du väljer i
inställningarna, och bekräftelsen talar om vilken.

Posten följer tävlingens eget förlopp:

- **Före lottningen** är den en **heldagspost** märkt **ledig** — den visar att
  du är anmäld utan att blockera dagen för någon som kollar om du är tillgänglig,
  eftersom du ännu inte vet vilka två timmar du är upptagen.
- **När starttiderna publicerats** blir samma post en **tidsatt post märkt
  upptagen**. Den uppdateras på plats i stället för att läggas till en gång
  till.

Poster som redan ligger i din kalender uppdateras varje gång du öppnar Mina
starter. Appen skapar aldrig en post som du inte själv lagt till, och om den
inte kan uppdatera en säger den det på raden i stället för att tyst låta den
vara fel.

!!! note "Patrullnumret räknas fram, det anges inte"

    Webshooters data innehåller inget patrullnummer — bara ett internt
    patrull-id som inte betyder något för en skytt. Numret som visas härleds ur
    den ordning patrullerna skjuter i. Det bör stämma med startlistan; skulle
    det någon gång inte göra det är det därför.

## Att importera resultat

**Verktyg → Webshooter → Importera resultat** listar tidigare tävlingar där du
har ett resultat. Att anmäla sig är inte samma sak som att skjuta: en utebliven
start eller ett avbrutet lopp lämnar en anmälan och ingenting att importera, så
de erbjuds inte.

Precision och milsnabb kommer in som en summa per serie; Webshooter sparar inte
de enskilda skotten. Varje serie räknar ändå sina skott som avlossade — i
Loggade skott, ammunitionssatsen och vapnets skottantal. En särskjutningsserie
märks **Särskjutning** och visas i en egen del, utanför passets summa, som i
ditt officiella resultat. Fältskjutning och poängfält kommer in **station för
station** — träffar, träffade figurer och eventuella poängmålspoäng, med
särskjutningsstationer sparade men utanför summan — och visas i den
resultatform tävlingen använde. Ett fältresultat vars stationssiffror inte kan
ha hänt, som sju träffar på en station, visas som ej importerbart i stället för
att rättas.

En tävlings resultat listar alla som sköt den, men granskningen visar bara
**dina egna starter**, ett kort per vapengrupp och klass. Välj på varje kort
vilket **Vapen** du sköt med: dess skottantal räknar då med de importerade
skotten. Webshooter registrerar inte provskott, så **Lägg till provskott**
lägger till dem (5 per omgång) när du använde dem; det är av tills du slår på
det.

Att kontrollera det kostar en förfrågan per tävling, så appen söker igenom
**ett år i taget**, minns vad den hittade, och söker inte om vid varje besök.
Varje skärm visar när dess uppgifter senast hämtades, och **Uppdatera** är hur
du ber om nya.

Den återhållsamheten är medveten. Webshooter är någon annans server, och den
svarar redan på vissa förfrågningar med fel.

## Rekord

**Inställningar → Rekord** visar dina personbästa, beräknade helt från passen
på den här enheten — importerade såväl som handloggade. Ingenting hämtas för
att bygga listan.

Det finns två uppsättningar, eftersom de svarar på olika frågor:

- **Officiella bästa** tillämpar tävlingsreglerna: ett precisionsresultat
  räknas bara med alla sju grundomgångsserier, ett milsnabbresultat bara med
  alla tolv. Ett träningspass, eller en tävling du loggat delvis, är inte ett
  officiellt bästa hur bra resultatet än är.
- **Dina egna bästa** bortser från allt det och tittar på varje pass du loggat
  — bästa fem serier, bästa tio, bästa hela pass.
- **Personbästa i fältskjutning** hålls per vapengrupp och **antal stationer
  som räknades**, eftersom träffar av åtta stationer och av tio inte är samma
  skala. Ett mästerskap på tio stationer där två ströks är ett resultat på åtta
  stationer och tävlar med dina kretsfältsomgångar. Omgångar rangordnas som SHB
  placerar dem — träffar, sedan figurer — och poängfältsomgångar hålls för sig,
  efter sina poäng. Tryck på ett bästa för att öppna passet.

Bästaresultat grupperas efter **gren och vapengrupp**. Din skytteklass ingår
inte: att gå från klass 2 till klass 3 nollställer inte ditt bästa med ett
vapen.

!!! note "Varje siffra säger vad den beräknats från"

    Under varje rubrik står en rad som *”Beräknat från 41 av dina 267 pass.”*
    De pass som kvalificerar är en bråkdel av allt du skjuter, och ett bästa
    som beräknats ur en del av historiken betyder något bara om du kan se hur
    stor del som användes.

    Pass **utan vapengrupp** redovisas under *Ingen vapengrupp* i stället för
    att falla bort. Det är vanligt efter import av äldre historik, där källan
    ofta inte registrerade någon.
