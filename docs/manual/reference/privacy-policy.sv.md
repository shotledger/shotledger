# Integritetspolicy

Gäller från: 20 oktober 2026.

Policyn gäller ShotLedger-appen för Android och iOS, den valfria synktjänsten på
`api.shotledger.app` och webbappen som körs därifrån. En kortare genomgång,
funktion för funktion, finns i [Dina data och integritet](privacy.md).

## Kort sagt

- Din loggbok finns i telefonen. Du behöver inget konto för att använda appen.
- Ingenting laddas upp om du inte slår på en funktion som skickar det, till
  exempel synk.
- Det finns ingen reklam, ingen analys, ingen spårning, och inga uppgifter säljs
  eller delas någonsin för marknadsföring.
- Om du skapar ett konto kan du radera det och allt som lagras med det, i appen
  eller i webbappen.

## Vem som är ansvarig

Personuppgiftsansvarig för de uppgifter synktjänsten lagrar är Jimisola
Laursen, Sverige, som utvecklar och driver ShotLedger.

Kontakt: [privacy@shotledger.app](mailto:privacy@shotledger.app)

## Vad som stannar i telefonen

Allt du matar in sparas i en databas i telefonen: pass, resultat, tavelfoton,
vapen (även serienummer och vapen-id om du anger dem), licenser och
licensnummer, ammunition, underhåll, anteckningar och dina inställningar som
födelseår och klass. ShotLedger, utvecklaren, har ingen åtkomst till dem.

Ett foto av ett licenskort läses i telefonen och raderas direkt efteråt; det
sparas aldrig och skickas aldrig.

Appen ber om de här behörigheterna, var och en först när du använder
funktionen som behöver den:

| Behörighet     | Används till                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Kamera, bilder | Att fotografera en tavla eller ett licenskort.                                                               |
| Mikrofon       | Att upptäcka skott till timern. Ljudet analyseras direkt och spelas aldrig in.                               |
| Plats          | "Använd min position" i ett pass, en gång per tryck, medan appen är öppen. Dina koordinater sparas inte.     |
| Kalender       | Att lägga in de tävlingsstarter du väljer från Webshooter i din kalender.                                    |
| Aviseringar    | Påminnelser om underhåll och om att en licens går ut. De skapas i telefonen; ingen push-tjänst är inblandad. |

## Vad som lämnar telefonen, och vart det går

### Synk och webbappen (valfritt, kräver konto)

Om du skapar ett konto lagrar synktjänsten:

- **Konto:** din e-postadress och en hash av ditt lösenord. Själva lösenordet
  sparas aldrig.
- **Nycklar,** om du lägger till en på webben: dess publika nyckel och id,
  vilken sorts lösenordshanterare eller enhet som skapade den om den uppger
  det, namnet på webbläsaren du lade till den från, och när. Den privata
  nyckeln och ditt fingeravtryck eller ansikte lämnar aldrig din enhet.
- **Din loggbok:** pass, serier, skott, foton, vapen, licenser, ammunition,
  taggar och övriga poster som appen synkar, samt inställningarna födelseår,
  klass, val om damklasser, efterlevnadsprofil och vilka funktioner du har
  dolt. Tavelfoton förminskas och sparas om innan de laddas upp, vilket tar bort
  deras platsuppgifter; originalet stannar i telefonen.
- **Inloggningar:** för varje inloggad enhet eller webbläsare, den IP-adress
  och den webbläsar- eller appidentifierare den loggade in från, så att du kan
  se och logga ut dina enheter.
- **Skydd mot missbruk:** IP-adressen vid inloggningsförsök, i högst 15
  minuter, för att begränsa lösenordsgissning.

Webbappen visar och ändrar samma uppgifter. Den håller din inloggning bara i
webbläsarfliken, använder inga kakor och laddar ingenting från tredje part.

**Varför (rättslig grund):** för att tillhandahålla synktjänsten du har anmält
dig till (GDPR artikel 6.1 b) och för att hålla den säker (artikel 6.1 f,
berättigat intresse).

### Funktioner som pratar direkt med andra tjänster

De här skickar uppgifter direkt från telefonen till en annan tjänst.
ShotLedgers servrar är inte inblandade, och den tjänstens egen
integritetspolicy gäller.

| Funktion                                          | Vad som skickas                                                                   | Till                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Webshooter (valfritt)                             | Din Webshooter-inloggning, därefter en token, och förfrågningar om dina resultat. | webshooter.se                                     |
| Förslag på skjutbanor (valfritt, av som standard) | Det du skriver i passets platsfält.                                               | Geokodaren Photon, photon.komoot.io (komoot GmbH) |
| "Använd min position" (valfritt, av som standard) | Dina koordinater just då.                                                         | OpenStreetMaps Overpass-API, overpass-api.de      |

### Skanning av licenskort (Google ML Kit)

Texten på ett licenskort läses i telefonen av Google ML Kit. Bilden och texten
lämnar aldrig telefonen. ML Kit skickar själv mätdata till Google om hur bra
textigenkänningen fungerar och hur ofta den används, och kan hämta uppdaterade
modeller; Google behandlar det enligt sina egna villkor.

### Appuppdateringar

Appen kan fråga Expos uppdateringstjänst (expo.dev) när den startar, så att
buggrättningar kan komma utan en uppdatering i butiken. Frågan skickar appens
version, plattform och uppdateringskanal, och ett slumpmässigt id för
installationen. Den skickar ingenting ur din loggbok.

### Säkerhetskopior och exporter

En säkerhetskopia eller export hamnar där du skickar den. ShotLedger ser den
aldrig.

### Google Play och App Store

Att ladda ner appen från en butik omfattas av butikens egen integritetspolicy.

## Vem som behandlar uppgifterna åt oss

Synktjänsten och webbappen körs hos Cloudflare (Cloudflare, Inc.), som lagrar
och behandlar uppgifterna för ShotLedgers räkning enligt sitt
personuppgiftsbiträdesavtal. Cloudflare kan behandla uppgifter utanför
EU/EES; sådana överföringar vilar på EU–USA-ramen för dataskydd (Data Privacy
Framework) och EU:s standardavtalsklausuler.

Ingen annan får de uppgifter synktjänsten lagrar.

## Hur länge uppgifter sparas

- **Kontouppgifter och din synkade loggbok:** tills du raderar ditt konto. När
  du raderar en post i appen tas dess innehåll bort från servern; en markering
  om att den raderats finns kvar så att dina andra enheter får veta det.
- **Inloggningar (IP-adress och app- eller webbläsaridentifierare):** tills du
  loggar ut eller tar bort enheten, eller tills inloggningen går ut: 7 dagar
  efter att appen senast användes, 12 timmar på webben. En utgången inloggning
  raderas inom 15 minuter.
- **Inloggningsförsök (IP-adress):** högst 15 minuter.
- **Felloggar:** Cloudflare sparar tjänstens loggar i högst 7 dagar.

## Radera ditt konto

I appen: **Inställningar → Konto och synk → Radera konto**. På webben: din
kontosida. Det raderar direkt och för gott ditt konto, alla synkade poster,
alla uppladdade foton, alla nycklar och alla inloggningar. Det som finns i telefonen stannar
där tills du tar bort appen eller dess data.

## Dina rättigheter

Enligt GDPR kan du begära en kopia av dina uppgifter, få dem rättade eller
raderade, ta dem med dig och invända mot behandlingen. Det mesta kan du göra
själv: appen exporterar din loggbok som CSV, JSON eller PDF, och när du raderar
ditt konto försvinner allt servern har. För allt annat, kontakta oss på
adressen ovan.

Du kan också klaga hos Integritetsskyddsmyndigheten
([imy.se](https://www.imy.se)) eller dataskyddsmyndigheten där du bor.

## Barn

Synktjänsten är inte avsedd för barn under 13 år. En yngre skytt kan använda
appen utan konto.

## Ändringar i policyn

Policyns historik är öppen i
[ShotLedgers kodförråd](https://github.com/shotledger/shotledger/commits/main/docs/manual/reference/privacy-policy.md).
En ändring som påverkar vad som samlas in eller varför meddelas i appens
versionsinformation innan den börjar gälla.
