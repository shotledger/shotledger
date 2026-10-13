# ShotLedger

En skytteloggbok för pistolskyttar, byggd kring det som faktiskt händer på
banan: en serie skjuts, skotten knappas in, nästa serie börjar.

Den kräver inget konto och fungerar offline.

## Vad den gör

- **Loggar pass skott för skott** — träning och tävling, under SPSF:s och
  ISSF:s program eller som fri träning. Ett fältskjutningspass loggas station
  för station, med träff, figurer, poäng och särskjutning; ett pass kan också
  bara ange antal avlossade skott.
- **Räknar en pappersavtavla från ett foto.** Du fotograferar tavlan, markerar
  var hålen sitter, och appen räknar fram poängen ur tavelansiktets verkliga
  geometri.
- **Håller reda på vapen och ammunition**, inklusive handladdning, skotträknare
  och underhåll.
- **Sparar skjutaktiviteten** som en svensk skytt behöver vid förnyelse av
  vapenlicens.
- **Tar tid på ditt skjutande** — en timer för skjuttider, intervallpass och
  IPSC-liknande serier, med mikrofonen som registrerar mellantiderna när du ber
  om det, och SPSF:s fälttimer med talade kommandon.
- **Visar hur det går** — statistik filtrerad på period, gren och taggar,
  personliga rekord, och en passrapport eller ett delningskort för ett pass.
- **Importerar tävlingsresultat** från WebShooter, med placering och
  standardmedalj.
- **Låter dina data förbli dina** — en säkerhetskopia du kan återställa på en
  ny telefon, pass exporterade som öppen JSON, och valfri synk med en webbapp
  där du kan läsa, mata in och ändra pass från vilken webbläsare som helst.

## Vad den inte är

Endast målskytte. Inte jakt, inte taktiskt.

Sverige är första marknaden snarare än gränsen: förbundens regler — grenar,
program, vapengrupper (en _weapon groups_) och skytteklasser — ligger i
datafiler, och
efterlevnadsfunktioner döljer sig där ingen profil gäller.

## Var du börjar

Har du precis installerat appen går [Kom igång](getting-started.md) igenom ditt
första pass i den ordning du faktiskt gör det på banan.

Letar du efter något särskilt tar guiderna upp
[att logga ett pass](guides/logging-a-session.md),
[att räkna från foto](guides/scoring-from-a-photo.md),
[timrarna](guides/timers.md),
[skjutaktivitet](guides/license-activity.md),
[statistik](guides/statistics.md),
[säkerhetskopiering](guides/backup-and-restore.md) och
[ditt konto på webben](guides/your-account-on-the-web.md).

!!! note "Den här manualen beskriver det aktuella bygget"

    ShotLedger har ännu inte haft någon release. Skärmar och formuleringar
    ändras mellan byggen, och den här manualen följer `main` snarare än en
    släppt version.
