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

Stäng därefter ShotLedger helt och öppna appen igen.

## Hur ofta

När det skulle irritera dig att förlora det du loggat sedan förra gången. För
de flesta skyttar är det efter en tävling, eller en gång i månaden.

!!! tip "Förvara filen någon annanstans än i telefonen"

    En säkerhetskopia som bara ligger i telefonen skyddar dig mot ett misstag i
    appen. Den skyddar dig inte mot att förlora telefonen.
