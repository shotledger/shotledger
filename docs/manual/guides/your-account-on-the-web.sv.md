# Ditt konto på webben

Om du använder synk kan du nå ditt konto och dina pass från vilken
webbläsare som helst med ShotLedgers webbapp, även när telefonen är
borttappad eller trasig. Den läser det som synken redan har sparat. Den ändrar
bara två saker: ett pass du skriver in under
[Mata in serier på webben](entering-series-on-the-web.md), och inställningarna
nedan.

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

Ändra det du behöver och tryck på **Spara**. Ändrar du ett födelseår som
redan var satt får du bekräfta först, som på telefonen. Telefonerna får
ändringen vid nästa synk. Om sparningen inte når servern finns ändringarna
kvar på sidan och **Försök igen** skickar dem på nytt; ingenting sparas när
fliken stängs. Loggar du in igen som ett annat konto visar sidan det kontots
inställningar, och dina osparade ändringar skickas inte dit.

Allt annat i telefonens Inställningar — språk, tema, valfria fält, timrar,
säkerhetskopior — hör till varje telefon och finns inte på webben.

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
