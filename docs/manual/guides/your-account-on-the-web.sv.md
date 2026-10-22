# Ditt konto på webben

Om du använder synk kan du nå ditt konto och dina pass från vilken
webbläsare som helst med ShotLedgers webbapp, även när telefonen är
borttappad eller trasig. Den läser det som synken redan har sparat och ändrar
bara det som telefonen själv kan ändra: ett pass du
[skriver in](entering-series-on-the-web.md),
[ändrar eller tar bort](editing-a-session-on-the-web.md), pass du
[ändrar flera åt gången](editing-many-sessions-on-the-web.md), och
inställningarna nedan.

Logga in med e-postadressen och lösenordet för ditt synkkonto, eller med en
[nyckel](#nycklar) som du har lagt till, och öppna sedan
**Konto** i menyn: till vänster, eller längs nederkanten på en smal skärm, som
telefonens flikar. När du stänger fliken loggas du ut från den
här webbläsaren och ingenting lämnas kvar: inloggningen finns bara i den
fliken, utan någon kaka. Servern avslutar den 12 timmar efter att du loggade
in, eller direkt när du använder **Logga ut**; en flik som fortfarande är öppen
då ber dig logga in igen.

## Pass

**Pass** i menyn listar alla synkade pass, det senaste först, med datum, gren
och matchformat, plats, resultat och taggar. Ett namn som appen hittat på
("Precision — 2026-09-23") visas utan sitt datum, som Datum-kolumnen redan ger.
På en smal skärm utelämnas gren, plats och taggar.

Öppna ett pass genom dess namn för att läsa det, i samma ordning som i
telefonen: namnet som sidans rubrik, vad passet var och vad det sköts med,
sedan resultatet, sedan vapen, ammunitionsparti, plats och anteckningar, sedan
serier och skott, eller för ett fältpass träff, figurer och stationer.

### Tavelfoton

En serie eller station med ett uppladdat tavelfoto visar det bredvid skotten.
Ett foto som telefonen inte har laddat upp än visas som **Inte uppladdat**, och
ett som inte längre finns på servern som **Saknas**. Om ett foto inte gick att
ladda, till exempel för att anslutningen bröts, visas **Kunde inte laddas** med
knappen **Försök igen**. Skottmarkeringar ritas inte på webben.

För att se foton sida vid sida kryssar du i **Jämför** under varje foto du vill
ha med, eller använder **Välj alla foton** för alla foton i passet. Du kan välja
foton från flera pass, och urvalet finns kvar medan du besöker Statistik eller
Konto. Välj sedan **Jämför foton**: fotona visas stora i ett rutnät, vart och
ett med seriens eller stationens resultat och passet. **Ta bort** tar bort ett
foto; **Rensa**, eller **Rensa alla** i jämförelsen, tömmer urvalet. Urvalet
glöms när du loggar ut, laddar om eller stänger fliken.

## Vapen

**Vapen** i menyn listar dina vapen som telefonens vapenflik gör, sorterade
efter tillverkare: vart och ett med sin vapentyp och samma statusrader för
licens, underhåll, saknade uppgifter och licensaktivitet. Vapen du har
arkiverat finns under **Visa arkiverade**.

Öppna ett vapen för att läsa det, i samma ordning som på telefonen: vapentyp,
ägande, kammare och vapenregister-id, antal skjutna skott och status för
underhåll, dess eget kort **Licensaktivitet** och **Kriterier för
föreningsintyg** med datumet då nästa pass senast ska loggas, sedan kalibrar,
vapengrupper, siktinställningar, licenser och underhållslogg. Det du har
stängt av under **Inställningar → Funktioner** lämnas bort, som på telefonen.

Webben visar bara dina vapen. Att lägga till eller ändra ett vapen, en licens,
underhåll eller en siktinställning, och att arkivera ett vapen, gör du i
telefonen. Telefonens ammunitionspartier finns inte på webben.

## Inställningar

**Inställningar** i menyn innehåller de inställningar som följer ditt konto
mellan enheter, samma som på telefonen:

- **Personligt**: Födelseår, Din klass och Damklasser och damgrenar
  (telefonens Inställningar → Personligt).
- **Efterlevnad**: profilen och, för Sverige, det aktivitetskrav som gäller
  dig (telefonens Inställningar → Efterlevnad). Har du inte valt något krav
  visar sidan det som räknats fram från dina vapen, som telefonen gör. Har
  du inte valt någon profil än är ingen markerad, och telefonen använder den
  som hör till dess språk; välj en här för att spara den för alla enheter.
- **Funktioner**: vilka delar av appen du visar (telefonens Inställningar →
  Funktioner, se [Dölja funktioner du inte använder](hiding-features.md)).

Ändra det du behöver och tryck på **Spara**. Ändrar du ett födelseår som
redan var satt får du bekräfta först, som på telefonen. Telefonerna får
ändringen vid nästa synk. Om sparningen inte når servern finns ändringarna
kvar på sidan och **Försök igen** skickar dem på nytt; ingenting sparas när
fliken stängs. Loggar du in igen som ett annat konto visar sidan det kontots
inställningar, och dina osparade ändringar skickas inte dit.

Allt annat i telefonens Inställningar — språk, tema, valfria fält, timrar,
säkerhetskopior — hör till varje telefon och finns inte på webben.

## Synk

När servern har nekat en ändring börjar kontosidan med kortet **Synk**. Det
visar samma två rader som **Konto & synk** på telefonen: ändringarna som
servern nekade, och ändringarna som väntar på en nekad ändring. Båda räknar
hela kontot, så telefonen och webben visar samma siffror. Kortet syns inte när
ingenting är nekat. Vad raderna betyder, och hur de försvinner, står i
[När servern nekar en ändring](backup-and-restore.md#nar-servern-nekar-en-andring).

## Inloggade enheter

Alla telefoner och webbläsare som är inloggade på kontot, med när de loggade
in och när de senast var aktiva, på minuten, så att två inloggningar från samma
webbläsare går att skilja åt. **Logga ut** bredvid en enhet avslutar dess
session; enheten måste logga in igen innan den kan synka. Använd det för en
telefon du inte längre har. En webbläsare försvinner från listan av sig själv
12 timmar efter att den loggade in.

Listan kräver en ny inloggning. Om den inte visas, logga ut ur webbappen och
logga in igen.

## Nycklar

Med en nyckel (passkey) loggar du in med fingeravtryck, ansikte eller
skärmlås i stället för att skriva ditt lösenord. Den sparas i din webbläsare,
din telefon eller din lösenordshanterare och kan följa med till dina andra
enheter på samma sätt som dina sparade lösenord. Ditt lösenord fungerar som
förut, så du blir aldrig utelåst på en enhet som saknar nyckel.

Lägg till en genom att logga in med lösenord och välja **Lägg till nyckel**
under **Nycklar**. Webbläsaren ber dig bekräfta med fingeravtryck, ansikte
eller skärmlås, och nyckeln listas med namnet på den här webbläsaren. Lägg
till en från varje webbläsare eller lösenordshanterare du använder. **Ta
bort** bredvid en nyckel tar bort den från ditt konto; ta bort den ur
webbläsaren eller lösenordshanteraren också.

Logga in med den genom att välja **Logga in med nyckel** på
inloggningssidan. Där webbläsaren stöder det erbjuds nyckeln också när du
klickar i e-postfältet.

Nycklar fungerar bara på ShotLedgers riktiga webbadress, över en säker
anslutning.

Telefonappen använder samma nycklar. Öppna **Inställningar** > **Konto och
synk** i telefonen. Utloggad loggar **Logga in med nyckel** under
lösenordsfältet in dig. Inloggad listar kortet **Nycklar** dina nycklar med
**Ta bort**, och **Lägg till nyckel** sparar en i telefonens
lösenordshanterare med namnet "ShotLedger-appen på Android" eller
"ShotLedger-appen på iOS". Om telefonen ber dig logga ut och in igen beror
det på att en nyckel bara kan läggas till inom ett dygn efter inloggningen.
En telefon utan skärmlås, eller utan Google Play-tjänster på Android, kan
inte använda nycklar, och kortet säger det.

## Fotolagring

Hur mycket av ditt fotoutrymme de uppladdade tavelfotona använder.

## Ladda ner allt

**Ladda ner** sparar en zip-fil med:

- `sessions.json` — alla synkade pass, vapen och licenser, i samma format som
  [Exportera pass](exporting-sessions.md). Telefonen kan importera den.
- `photos/` — alla uppladdade tavelfoton, en mapp per pass.

Varje pass har med sina taggar, som i telefonens egen export.

Ett foto som inte går att hämta stoppar inte resten. Zip-filen listar det då i
`missing.txt`.

## Radera konto

**Radera konto** visar först vad som skulle tas bort: synkade rader, foton och
inloggade enheter. **Radera** tar sedan bort kontot och allt på servern, även
nycklar, och loggar ut alla enheter. Loggboken i telefonen rörs inte. Det går inte att
ångra, så ladda ner allt först om du vill ha en kopia.

## Källkod

ShotLedger är fri programvara. **Källkod** i profilmenyn uppe till höger
öppnar källkoden för appen och webbappen.
