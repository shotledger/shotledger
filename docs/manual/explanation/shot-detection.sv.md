# Hur skottimern hör ett skott

[Att använda timrarna](../guides/timers.sv.md) är uppgiften. Den här sidan
handlar om vad mikrofonen faktiskt gör medan klockan går — och framför allt vad
den inte klarar, hur du än ställer in den.

## Enbart ljudstyrka kunde aldrig fungera

Den första versionen av detekteringen räknade ett skott så snart mikrofonnivån
passerade ett visst antal decibel. Den gick inte att göra användbar inomhus. På
den minst känsliga inställning som fanns slog en fingerknäpp ändå i taket på
mätaren, och det fanns inget mer att skruva ner.

Två saker samverkar. En telefonmikrofon är byggd för tal, så Android lägger på
automatisk förstärkningsreglering: tysta ljud lyfts och höga trycks ihop, vilket
är precis fel behandling av ett ljud vars kännetecken är att det är kortvarigt
enormt. Och en skjutbana är inte tyst från början — när tröskeln är låg nog att
fånga ditt eget skott ligger rummet också över den.

## Tre mätningar i stället för en

Timern frågar därför inte "var det högt?". Den ställer tre frågor om varje ljud,
och ett skott måste svara ja på alla tre.

**Stack det ut från rummet?** Appen håller reda på bakgrundsnivån och mäter
varje ljud mot _den_, inte mot ett absolut tal. Inställningen du väljer är ett
avstånd över rummet, och därför betyder den samma sak i en tyst källare som på
en blåsig bana — och därför spelar det ingen roll att förstärkningsregleringen
flyttar allt upp eller ner tillsammans.

**Kom det tvärt?** En mynningssmäll når sin topp nästan omedelbart. En dörr som
svänger, en röst, en bil utanför — de växer fram. Ett ljud som tar sig tid att
bli högt räknas inte, hur högt det än slutar.

**Var det över snabbt?** Det är den fråga en ljudstyrketröskel inte kan
uttrycka, och det är den kommersiella skottimrar grindar på. En smäll är en kort
impuls. Ett ljud som ligger kvar är något annat, och avvisas på den grunden även
om det började som ett skott.

## Vad den fortfarande inte klarar

Den kan inte skilja ditt skott från en annan skarp smäll. En fingerknäpp är
kort, tvär och långt över rummet: enligt varje mätning ovan _är_ den ett skott,
och ingen inställning ändrar det. Detsamma gäller en granne på nästa station.

Att skilja dem åt kräver att timern känner igen ljudet av just ett skott, i
stället för formen på en impuls — ett annat slags problem än det som är löst
här. Alltså: timern är pålitlig om _när_ något hände och ärlig om _vad_ det var.

## Ställa in den för din bana

Öppna **Skottdetektering** på skottimern och klappa i händerna eller torrsmäll
nära telefonen.

Stapeln visar nuvarande nivå, den högsta hittills, ett grått streck där appen
tror att rummet ligger och ett rött streck där din utlösning ligger över det.
Under den står antalet ljud som faktiskt klarade alla tre testerna — det
antalet, inte stapeln, är svaret på "kommer den att höra mitt skott?".

Skruva ner känsligheten tills rummet slutar registreras, och kontrollera sedan
att ditt eget skott fortfarande gör det. **Låg**, **Mellan** och **Hög** ställer
både avståndet över rummet och hur kort ljudet måste vara, och är ett rimligt
ställe att börja på innan du rör reglaget.

Skärmen **Diagnostik för skottdetektering**, bakom ⋮-menyn, spelar in vad
mikrofonen faktiskt hörde så att en envis bana kan undersökas i efterhand i
stället för gissas om.
