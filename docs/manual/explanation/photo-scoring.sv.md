# Vad fotoräkningen gör, och inte gör

[Att räkna en tavla från ett foto](../guides/scoring-from-a-photo.sv.md) är
uppgiften. Den här sidan handlar om vad funktionen faktiskt är, och varför den
slutar där den slutar.

## Assisterad, inte automatisk

Det här är **assisterad** räkning, inte automatisk. Du markerar hålen; appen
sköter geometrin, ringgränserna och räknandet.

Den hittar inte hålen åt dig. Det är ett genuint svårt problem på pappstavlor —
lappar på en lagad tavla ser mycket ut som färska hål — och en automatisk
detektor som har fel är sämre än ingen detektor alls, eftersom du då får rätta
mer än du hade behövt markera.

## Att hjälpa den bli bättre

**Inställningar → Förbättra automatisk poängräkning → Spara mina markeringar som träningsdata** är avstängt som
standard. Slår du på det sparas dina markeringar — även de du rättade — i
telefonen, så att en håldetektor så småningom kan tränas på verkliga tavlor.

Ingenting skickas någonstans. Markeringarna stannar på din enhet, och du kan
radera dem.

Det är hela ambitionen: inte att släppa en detektor som gissar, utan att samla
tillräckligt många verkliga, rättade markeringar för att en ska kunna tränas
ärligt längre fram.
