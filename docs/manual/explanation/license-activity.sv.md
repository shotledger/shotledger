# Så räknas skjutaktiviteten

[Att slå på det, välja fall och få ut loggen](../guides/license-activity.sv.md)
är stegen. Den här sidan är modellen bakom dem: vad kravet är, hur appen läser
det, och vad den medvetet lämnar därhän.

## Kravet

När den svenska profilen är på räknar appen de pass du loggat de senaste **sex
månaderna** och jämför summan med kravet för ditt fall.

Kravet kommer från sidan 3 i Polismyndighetens blankett för föreningsintyg, som
anger två nivåer (samma sidas två rutor om enskilda vapen finns [längre
ned](#de-tva-kriterierna-som-galler-ett-enskilt-vapen)):

| Ditt fall                                          | Paragraf | Krav                                             | Under sex månader |
| -------------------------------------------------- | -------- | ------------------------------------------------ | ----------------- |
| Du har inte tidigare enhandsvapen för målskjutning | 5 §      | sammantaget i genomsnitt minst **två** per månad | **12**            |
| Du innehar sedan tidigare enhandsvapen             | 6 §      | sammantaget i genomsnitt minst **en** per månad  | **6**             |

Träning och tävling räknas lika, liksom att representera föreningen i externa
tävlingar. En aktivitet är ett loggat pass — inte en serie, och inte en dag.

## Ditt fall, och var det kommer ifrån

Appen föreslår ett av de två utifrån dina vapen: finns det en **pistol eller
revolver** som du har angett som **eget**, tillämpas 6 §. Annars tillämpas
5 §, det strängare fallet.

Det är ett förslag, inte en bedömning av dina licenser. Det läser två saker du
själv har angett — vapentypen och
[ägandet](../guides/firearms-and-ammunition.sv.md) — och inget annat:

- Ett gevär du äger är inget enhandsvapen och ändrar därför ingenting.
- En luftpistol räknas inte heller. Appen för luftpistoler och luftgevär under
  samma vapentyp och kan inte skilja ett licenspliktigt vapen från övriga, så
  den låter dig stå kvar på det strängare fallet.
- Ägandet står på **eget** från början på alla vapen, även de du registrerade
  innan fältet fanns. Appen utgår alltså från att du äger dina enhandsvapen om
  du inte säger något annat, och fallet den föreslår för en vapenägare blir
  därför 6 §, det lindrigare av de två. Anger du **lånat** på ett vapen slutar
  det räknas.

Skärmen säger också **varför** den valde som den gjorde – ”eftersom inget
registrerat vapen är en pistol eller revolver som du äger”, till exempel. Det
spelar roll efter en import: ett vapen som skapats genom att importera pass
kommer in utan vapentyp och utan licens, så appen kan se fem enhandsvapen och
ändå sakna uppgifter som säger att de _är_ enhandsvapen. Förslaget har då rätt
om uppgifterna och fel om dig, och motiveringsraden är det som gör det synligt
i stället för gåtfullt.

## ”I genomsnitt”, närmare bestämt

Blanketten säger _sammantaget i genomsnitt_. Appen läser det som en summa över
hela sexmånadersperioden: tolv aktiviteter någonstans under de sex månaderna
uppfyller 5 §, oavsett om de var jämnt fördelade eller inte. Något visst antal
varje kalendermånad krävs inte.

## Vad som räknas, och vad det här inte är

**Alla pass räknas, oavsett vad du sköt med.** 5 § och 6 § är krav på _dig_,
inte på ett visst vapen eller en viss vapengrupp – blanketten frågar om du
deltagit i föreningens skjutningar och nämner ingen vapengrupp. Ett pass räknas
alltså mot licensaktiviteten även om du aldrig angav någon vapengrupp för det,
och även om vapnet du sköt med inte finns i appen. Det spelar störst roll
direkt efter en import av äldre historik, där vapengrupperna oftast är
glesast.

Samma siffra visas därför på varje vapen: det är din aktivitetsnivå, visad
intill varje vapen för bekvämlighets skull – inte det vapnets egen räkning.
Skärmen säger det under siffran.

Licensaktivitet räknar det du loggat. Ett banbesök du inte loggade finns inte
med, och ett pass som loggats två gånger räknas två gånger.

!!! warning "Din förening och polisen avgör, inte appen"

    Appen räknar pass mot ett publicerat krav. Den utfärdar inte intyget och
    har ingen uppfattning om huruvida föreningen skriver under eller om polisen
    beviljar licensen. Betrakta en grön status som ”räkningen ser rätt ut”,
    inte som ett godkännande.

## De två kriterierna som gäller ett enskilt vapen

5 § och 6 § är blankettens allmänna fråga. Samma sida har två rutor till, under
_Intyget avser_, och båda handlar om ett **visst vapen** i stället för om dig:

| Rutan                                    | Vad den frågar                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Ytterligare enhandsvapen**             | minst **två** aktiviteter de senaste **sex månaderna** med respektive enhandsvapen du redan innehar |
| **Förnyelse av tidsbegränsat tillstånd** | minst **fyra** aktiviteter **under vart och ett av de två senaste åren** med sökt vapen             |

Båda visas på vapnets egen sida, under _Kriterier för föreningsintyg_, och båda
räknar **bara de pass du loggat med det vapnet**. Ett pass loggat med ett annat
vapen räknas till det i stället, och ett pass utan vapen räknas till inget av
dem. Appen skriver ut båda siffrorna under kriteriet i stället för att tyst
utelämna dem — så ”0 av 2 aktiviteter med det här vapnet” står bredvid ”54 pass
under perioden loggades med andra vapen”, och siffran går att läsa i stället
för att skrämmas.

**Fyra per år i två år är inte åtta på två år.** Appen kontrollerar varje
tolvmånadersperiod för sig, så åtta aktiviteter i fjol och inga året dessförinnan
uppfyller inte förnyelsekriteriet — vilket är vad blanketten säger, och
skillnaden som en enda löpande summa hade dolt.

### Vilka vapen de visas för

Appen har ingen tillgång till dina licenser, så den utgår från det du berättat:

- **Ytterligare enhandsvapen** visas för vapen vars vapentyp är **pistol eller
  revolver** och som du markerat som **Eget** — samma läsning av ”enhandsvapen
  du innehar” som förslaget för 5 §/6 § använder.
- **Förnyelse av tidsbegränsat tillstånd** visas för vapen vars senaste licens
  har ett **slutdatum**. En licens utan slutdatum gäller tills vidare och är
  inget tidsbegränsat tillstånd. Vapentypen spelar ingen roll: blankettens
  förnyelseruta nämner ingen.

Saknas ett kriterium på ett vapen där du väntat dig det är det där du ska titta
— oftast en vapentyp som fattas eller en licens registrerad utan giltighetstid.

!!! warning "Räknat är inte styrkt"

    I en klubblogg blir en rad ett underlag när någon signerat kolumnen _Uppg.
    styrkta av_. Appen har ingen motsvarighet och hittar inte på någon. ”6 av 4
    aktiviteter med det här vapnet” betyder att appen räknat sex pass du loggat
    — inte att någon har styrkt dem.

## Vad appen inte håller reda på

En regel på samma blankett är **inte** modellerad här: **särskilda skäl**
(sjukdom, graviditet, utlandstjänstgöring), som kan ursäkta ett uppehåll enligt
6 §. Det avgörs av Polismyndigheten utifrån en särskild bilaga, inte av dig
eller din förening, så appen erbjuder sig inte att tillämpa dem.

## Källa

Polismyndighetens blankett **PM 551.24 Föreningsintyg**, sidan 3 (”Förklaringar
och anvisningar vid utfärdande av föreningsintyg”), som återger **PMFS 2016:4 /
RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§**, och bär de två rutorna om enskilda
vapen under _Intyget avser_. Blanketten publiceras på
[polisen.se](https://polisen.se/b9596e33879c4925472a5edb9c451ab1/siteassets/blanketter/polisens-blanketter-551-24.pdf).
