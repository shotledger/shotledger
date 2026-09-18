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
avgör vilket krav på [licensaktivitet](licence-activity.sv.md) du mäts mot.

Till ett vapen samlas:

- **Skottantal**, från de pass du loggar på det. Raderar du ett pass räknas
  dess skott bort igen.
- **Underhåll** — rengöringar och utfört arbete, med skottantalet vid
  tillfället.
- **Siktesinställningar**, med namn, så att "inomhus 25 m" och "fält ute" blir
  två lägen du kan ta fram i stället för något du ska minnas.

Siktesinställningarna går att nå från passet självt, så en justering mellan
serier innebär inte att du måste lämna det du håller på med.

## Ammunition

En ammunitionssats är antingen fabriksammunition eller en handladdning.

För en handladdning kan du anteckna kulans fabrikat, modell och vikt, krut och
laddning, tändhatt, hylsa, patronens totallängd och crimp. Det finns där för
att en laddning som sköt bra ska gå att göra om, och en som inte gjorde det ska
gå att känna igen.

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
