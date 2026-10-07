# Ditt konto på webben

Om du använder synk kan du nå ditt konto och dina pass från vilken
webbläsare som helst med ShotLedgers webbapp, även när telefonen är
borttappad eller trasig. Den läser det som synken redan har sparat och ändrar
ingenting i loggboken.

Logga in med e-postadressen och lösenordet för ditt synkkonto och öppna sedan
**Konto** i menyn till vänster. När du stänger fliken loggas du ut från den
här webbläsaren och ingenting lämnas kvar.

## Pass

**Pass** i menyn listar alla synkade pass, det senaste först, med datum, gren
och matchformat, plats, resultat och taggar. På en smal skärm utelämnas gren,
plats och taggar.

Öppna ett pass genom dess namn för att läsa det: serier och skott, summorna,
anteckningar, vapen, ammunitionsparti och taggar, eller stationerna för ett
fältpass. Ingenting kan ändras där.

### Tavelfoton

En serie eller station med ett uppladdat tavelfoto visar det bredvid skotten.
Ett foto som telefonen inte har laddat upp än visas som **Inte uppladdat**.
Skottmarkeringar ritas inte på webben.

För att se foton sida vid sida kryssar du i **Jämför** under varje foto du vill
ha med, eller använder **Välj alla foton** för alla foton i passet. Du kan välja
foton från flera pass. Välj sedan **Jämför foton**: fotona visas stora i ett
rutnät, vart och ett med seriens eller stationens resultat och passet. **Ta
bort** tar bort ett foto, och **Rensa** tömmer urvalet. Urvalet glöms när du
laddar om eller stänger fliken.

## Inloggade enheter

Alla telefoner och webbläsare som är inloggade på kontot, med när de loggade
in och när de senast var aktiva. **Logga ut** bredvid en enhet avslutar dess
session; enheten måste logga in igen innan den kan synka. Använd det för en
telefon du inte längre har.

Listan kräver en ny inloggning. Om den inte visas, logga ut ur webbappen och
logga in igen.

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
inloggade enheter. **Radera** tar sedan bort kontot och allt på servern och
loggar ut alla enheter. Loggboken i telefonen rörs inte. Det går inte att
ångra, så ladda ner allt först om du vill ha en kopia.
