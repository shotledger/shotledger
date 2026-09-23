# Vad fotoräkningen gör, och inte gör

[Att räkna en tavla från ett foto](../guides/scoring-from-a-photo.sv.md) är
uppgiften. Den här sidan handlar om vad funktionen faktiskt är, och varför den
slutar där den slutar.

## Assisterad, inte automatisk

Det här är **assisterad** räkning, inte automatisk. Appen sköter geometrin,
ringgränserna och räknandet, och den föreslår var hålen sitter; du avgör vilka
markeringar som står kvar.

Förslagen är ett försprång, inte ett resultat. På verkliga klubbtavlor hittar
appen ungefär tre hål av fyra och har fel på ungefär ett förslag av tio, och en
serie blir helt rätt ungefär en gång av tre. Det är siffrorna bakom de streckade
markeringarna, och de är skälet till att varje sådan markering ritas så att du
tittar på den. Att hitta hål är ett genuint svårt problem på pappstavlor:
lapparna på en lagad tavla, de tryckta ringsiffrorna och det rivna papperet
runt ett dubbelhål ser alla ut som hål vid första anblicken, och en detektor
som gissade tyst vore sämre än ingen alls, eftersom du då skulle få rätta mer
än du hade behövt markera.

Appen letar efter hål på 25 m precisionstavlan, den tavla detektorn mättes på.
Det gör den oavsett om den hittade tavlan själv — på svartens kant eller på
ringlinjerna i en närbild — eller om du satte de fyra punkterna. På alla andra
tavlor markerar du varje hål.

## Att hjälpa den bli bättre

**Inställningar → Förbättra automatisk poängräkning → Spara mina markeringar som träningsdata** är avstängt som
standard. Slår du på det sparas dina markeringar — även de du rättade — i
telefonen, så att en håldetektor så småningom kan tränas på verkliga tavlor.

Ingenting skickas någonstans. Markeringarna stannar på din enhet, och du kan
radera dem.

Det är hela ambitionen: inte att släppa en detektor som gissar, utan att samla
tillräckligt många verkliga, rättade markeringar för att en ska kunna tränas
ärligt längre fram.
