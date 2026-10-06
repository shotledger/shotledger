# Ditt konto på webben

Om du använder synk kan du nå ditt konto från vilken webbläsare som helst med
ShotLedgers webbapp, även när telefonen är borttappad eller trasig. Den läser
det som synken redan har sparat och ändrar ingenting i loggboken.

Logga in med e-postadressen och lösenordet för ditt synkkonto och öppna sedan
**Konto** i menyn till vänster. När du stänger fliken loggas du ut från den
här webbläsaren och ingenting lämnas kvar.

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

Passens taggar finns inte i filen: taggar synkas inte, så de finns bara i
telefonen som satte dem.

Ett foto som inte går att hämta stoppar inte resten. Zip-filen listar det då i
`missing.txt`.

## Radera konto

**Radera konto** visar först vad som skulle tas bort: synkade rader, foton och
inloggade enheter. **Radera** tar sedan bort kontot och allt på servern och
loggar ut alla enheter. Loggboken i telefonen rörs inte. Det går inte att
ångra, så ladda ner allt först om du vill ha en kopia.
