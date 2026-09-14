# Webshooter

[Webshooter.se](https://webshooter.se/) är SPSF:s tävlingssystem — anmälningar,
startlistor och officiella resultat. ShotLedger kan läsa dina egna uppgifter
därifrån.

**Inställningar → Externa webbplatser → Webshooter.** Slå på det, och anslut
sedan.

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

Att kontrollera det kostar en förfrågan per tävling, så appen söker igenom
**ett år i taget**, minns vad den hittade, och söker inte om vid varje besök.
Varje skärm visar när dess uppgifter senast hämtades, och **Uppdatera** är hur
du ber om nya.

Den återhållsamheten är medveten. Webshooter är någon annans server, och den
svarar redan på vissa förfrågningar med fel.
