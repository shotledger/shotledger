# Vapen och ammunition

## Vapen

**Vapen → lägg till.** Fabrikat och modell identifierar vapnet; det är
**vapengruppen** som kopplar det till resten av appen — se
[Vapengrupp och klass](../reference/weapon-group-and-class.md).

**Ägande** anger om vapnet är ditt eget eller lånat — både klubbens vapen och
någon annans räknas som lånat. Det står på **eget** både för ett vapen du
lägger till och för allt du registrerade innan fältet fanns, så ange **lånat**
på de vapen som inte är dina. Det är det enda på den här skärmen som ändrar vad
appen kräver av dig på annat håll: att du äger ett enhandsvapen är det som
avgör vilket krav på [licensaktivitet](license-activity.sv.md) du mäts mot.

### Ofullständig

Ett vapen visar **Ofullständig** så länge något appen behöver saknas: vapentyp,
kammare eller licens. Importerade vapen kommer oftast in så, eftersom en import
sällan bär mer än fabrikat och modell.

Ett **luftvapen frågas aldrig efter licens**. Ett effektbegränsat luftvapen
kräver ingen i Sverige, och en 10 m-luftpistol ligger med god marginal under
gränsen — det räknas alltså som fullständigt utan licens. Appen går på
vapentypen, som den känner till, inte på mynningsenergin, som den inte gör: äger
du ett luftgevär som är kraftigt nog att kräva licens påminner appen dig inte om
det.

Ett lånat vapen frågas inte heller efter licens. Den pappersexercisen är inte
din.

### Kammare, och vad vapnet mer skjuter

Ett vapen har en **kammare** — vad det är byggt för, och det din licens anger.
Under den kan du lista andra patroner du faktiskt skjuter med det.

En .357 Magnum-revolver matad med .38 Special är det vanliga fallet i
precisionsskytte, inte ett udda, och ett svenskt föreningsintyg kan ange båda
på samma rad. Tidigare hade appen ett enda kaliberfält, vilket tvingade fram
ett val mellan att registrera kammaren och att registrera vad du skjuter — och
båda svaren var till hälften fel.

Att lista en patron begränsar ingenting. När du väljer ammunitionssats till ett
pass hindrar appen dig inte från att välja en som vapnet inte listar: du kan ha
goda skäl, och appen känner dem inte.

Till ett vapen samlas:

- **Skottantal**, från de pass du loggar på det — varje avlossat skott, räknat
  [på samma sätt överallt](../explanation/how-shots-are-counted.md). Raderar du
  ett pass räknas dess skott bort igen. **Justera antal skott** på vapnet rättar
  en räknare som visar fel: ett heltal skott, med minustecken för att ta bort
  skott, och en anledning.
- **Underhåll** — rengöringar och utfört arbete, med skottantalet vid
  tillfället. Varje post visar datum och anteckningen du skrev; en justering
  av skottantalet visar hur mycket räknaren flyttades och sin anledning ("+10 ·
  skott med klubbvapen").
  **Skott sedan underhåll** räknas från posten med senast datum. En post du
  loggar i efterhand med ett tidigare datum sparas i loggen men nollställer
  inte antalet. En justering flyttar båda antalen lika mycket.
  Anger du ett **Underhållsintervall** (ett heltal skott) får du en notis i
  telefonen en gång när
  **Skott sedan underhåll** når det, oavsett vad som förde in skotten: en
  sparad serie, ett pass med bara skottantal, en import eller **Justera antal
  skott**. Sedan är det tyst tills du loggar underhåll och antalet når
  intervallet igen. Skott som kommer in via synk, inmatade på webben eller på en
  annan enhet, ger ingen notis. På Android har notiserna en egen kategori,
  **Underhåll**, som du kan stänga av utan att stänga av resten.
- **Siktesinställningar**, med namn, så att "inomhus 25 m" och "fält ute" blir
  två lägen du kan ta fram i stället för något du ska minnas.

Siktesinställningarna går att nå från passet självt, så en justering mellan
serier innebär inte att du måste lämna det du håller på med.

### Arkivera ett vapen du inte längre har

När du har sålt, lämnat tillbaka eller slutat använda ett vapen öppnar du det
och trycker på **Arkivera vapen** längst ner på sidan. Att arkivera behåller
allt som hör till vapnet; det flyttar bara undan det.

Ett arkiverat vapen:

- försvinner från vapenlistan. **Visa arkiverade** under listan visar det igen,
  och du kan öppna det därifrån.
- erbjuds inte längre när du startar ett pass, varken i telefonen eller på
  webben. Ett pass du redan loggat med det behåller det, och du kan fortfarande
  välja det när du redigerar det passet.
- behåller sina pass, sin statistik, sina licenser, sitt underhåll och sina
  siktesinställningar. Passlistan kan fortfarande filtrera på det.
- skickar inga fler påminnelser om licensen eller notiser om underhåll.
- räknas inte längre som ett vapen du äger när appen föreslår vilket fall av
  [licensaktivitet](../explanation/license-activity.md) som gäller dig, och
  visar ingen egen licensaktivitet. Passen du sköt med det räknas fortfarande.

**Återställ vapen** på ett arkiverat vapen tar tillbaka det som det var, och
påminnelserna om licensen börjar igen.

## Ammunition

En ammunitionssats är antingen fabriksammunition eller en handladdning.

För en handladdning kan du anteckna kulans fabrikat, modell och vikt, krut och
laddning, tändhatt, hylsa, patronens totallängd och crimp. Det finns där för
att en laddning som sköt bra ska gå att göra om, och en som inte gjorde det ska
gå att känna igen.

Laddar du aldrig själv stänger du av **Inställningar → Valfria fält → Handladdning**, så försvinner reglaget Handladdning och receptet ur
ammunitionsformuläret. En sats som redan är en handladdning behåller dem.

### Slå ihop två partier som är samma

När ett parti har lagts in två gånger öppnar du kopian du inte vill ha och
trycker på **Slå ihop med ett annat parti** längst ned, och sedan på partiet
du vill behålla. Appen frågar först och säger hur många pass som flyttas. Alla
pass på kopian flyttas till partiet du behåller, och kopian tas bort. Ett
borttaget pass behåller sitt gamla parti.

Partiet du behåller lämnas som det är: kopians antal och anteckningar läggs
inte till, så rätta antalet för hand om det ska ändras. En sammanslagning går
inte att ångra.

Med synk påslagen får andra enheter sammanslagningen vid nästa synk. Ett pass
som sparats på kopian på en enhet som inte hunnit synka pekar fortfarande på
den borttagna kopian och visar inget ammunitionsparti; ändra passet och välj
partiet du behöll. En ändring av själva kopian som gjorts på en sådan enhet
släpps. Webbappen kan göra samma sammanslagning: se
[Ändra flera pass på webben](editing-many-sessions-on-the-web.md#merge-ammo-lots).

### Power factor och mynningsenergi

Ange kulvikt och mynningshastighet så visar appen båda:

- **Power factor**, i det gängse grain·fps/1000, avkortat till helt tal
  eftersom IPSC bortser från decimalerna — en laddning som räknas till 124,9
  blir Minor, inte de 125 som är gränsen.
- **Mynningsenergi**, i joule, med en decimal. Decimalen spelar roll i nedre
  delen av skalan: luftpistolenergier ligger på ensiffriga tal, där avrundning
  till hela joule skulle sudda ut skillnaden mellan 7,4 och 7,5.

!!! note "Inga gränsvärden är inbyggda"

    Appen räknar fram siffrorna. Den bedömer dem inte mot någon lagstadgad
    gräns eller förbundsgräns, eftersom det är regelverksvärden som skiljer sig
    mellan jurisdiktioner och ändras över tid. Att kontrollera en gräns är ditt
    ansvar.
