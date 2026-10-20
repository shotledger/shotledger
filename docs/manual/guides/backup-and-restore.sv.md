# Säkerhetskopiering och återställning

Allt ligger i telefonen. Inget konto krävs, ingenting laddas upp om du inte
slår på synk — vilket är själva poängen, och vilket betyder att **en förlorad
telefon är en förlorad loggbok om du inte har en kopia**.

**Inställningar → Säkerhetskopiering och data.**

## Att göra en

**Säkerhetskopiera** frågar vad som ska ingå och var filen ska hamna:

- **Alltid med** — pass, serier, skott, vapen, ammunition, licenser, taggar,
  underhåll och inställningar.
- **Foton** — valfritt, och skälet till att en säkerhetskopia kan bli stor.
  Omfattar tavelfoton som hämtats via synk, inte bara de som tagits med den
  här telefonen.

Du kan dela filen via den vanliga delningsrutan, eller skriva den direkt till
en mapp du väljer, vilket går snabbare när du säkerhetskopierar regelbundet.

## Att återställa

**Återställ från säkerhetskopia**, och välj sedan en `.shotledger`-fil.

Återställning **ersätter allt på enheten**. Innan den gör det tar appen en
säkerhetskopia av det som finns just nu, så att en återställning av fel fil går
att ta sig ur.

Appen visar vad filen innehåller — datum, pass, serier, skott, vapen, foton —
innan du bekräftar. Läs det; det är där du hinner upptäcka att du valde förra
årets fil.

Vissa filer avvisas innan något på enheten ändras:

- **En fil från en version med en annan databasstruktur.** Fram till att
  ShotLedger når 1.0 kan en ny version ändra strukturen utan att äldre
  säkerhetskopior konverteras. Om filen kommer från en nyare version,
  uppdatera appen och försök igen.
- **En fil som är skadad, eller som inte ser ut precis som en fil appen själv
  skriver.** Den rapporteras som att den inte är en ShotLedger-säkerhetskopia.

En fil som gjorts av en äldre version som fortfarande hade valvet återställs
som vanligt. Valvdelen hoppas över: funktionen finns inte längre, och inget i
appen kan öppna den.

När återställningen är klar startar ShotLedger om av sig själv för att läsa in
den återställda datan.

### Med synk påslagen

En säkerhetskopia rymmer din loggbok, inte synkens läge. Efter en
återställning börjar nästa synk om från början. Den hämtar allt kontot har,
och skickar ingenting från filen av sig själv.

- **Det som kontot redan har kommer tillbaka som kontot har det.** Ett pass du
  ändrade på telefonen och aldrig synkade innan säkerhetskopian ersätts av
  kontots version, om kontot har en. Synka innan du gör en säkerhetskopia du
  tänker återställa från.
- **Det som kontot aldrig har haft stannar på telefonen.** Det skickas nästa
  gång du ändrar det.
- Att återställa en säkerhetskopia gjord under ett annat konto blandar inte
  ihop de två. Telefonen hämtar det inloggade kontots data och skickar
  ingenting från filen.

### När servern nekar en ändring

Om **Konto & synk** säger att ändringar nekades av servern, hittade servern
något i dem som den inte kan lagra. Det är ett fel i appen, inte något du har
gjort. Servern lägger den nekade ändringen åt sidan: den finns inte på dina
andra enheter eller i webbappen förrän den kommer fram rättad. Om du ändrar
samma post igen, på telefonen, en annan enhet eller i webbappen, skickas en ny
version; om den kan lagras upphör nekandet. Om raden fortsätter att komma
tillbaka, rapportera det.

En nekad ändring håller också tillbaka de ändringar som hör ihop med den, så
att dina andra enheter aldrig ser ett halvt pass. Medan den gör det visar
**Konto & synk** "n ändring(ar) väntar på en nekad ändring". För ett pass
gäller det varje serie, skott och station i det, och själva passet; för ett
vapen dess licenser, grupper, kalibrar, underhåll och siktinställningar, men
inte de pass som skjutits med det. Raderingar hålls aldrig tillbaka.

- Servern behåller de tillbakahållna ändringarna tills den nekade ändringen
  kommer fram rättad, eller tills den eller dess pass raderas, från vilken
  enhet som helst. Då lagrar den alla på en gång.
- Ändringar av passet från dina andra enheter och från webbappen väntar också
  på servern. De går inte förlorade om du loggar ut, återställer en
  säkerhetskopia eller installerar om appen.
- Båda raderna räknar hela kontot: alla enheter och webbappen visar samma
  siffror.
- När två enheter ändrar samma post vinner den ändring som kom fram till
  servern sist. En tillbakahållen ändring räknas från när den kom fram till
  servern, inte från när den lagras. En radering vinner alltid.

Andra enheter visar passet som det var före den nekade ändringen tills servern
lagrar de tillbakahållna ändringarna.

## Hur ofta

När det skulle irritera dig att förlora det du loggat sedan förra gången. För
de flesta skyttar är det efter en tävling, eller en gång i månaden.

!!! tip "Förvara filen någon annanstans än i telefonen"

    En säkerhetskopia som bara ligger i telefonen skyddar dig mot ett misstag i
    appen. Den skyddar dig inte mot att förlora telefonen.
