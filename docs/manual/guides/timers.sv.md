# Timers

**Verktyg → Timers.** Tre lägen, alla på samma skärm.

## Tidsgräns

En nedräkning med valfri klarförberedelse, upprepad för så många serier du
vill, med vila emellan. Det här är läget för att öva ett skjutprograms tidsförlopp
utan att ha en tävling att skjuta.

Skjuttid, klarförberedelse, repetitioner och vila ställs alla in med reglage,
med det inställda värdet ovanför varje reglage. Vila visas bara när du valt mer
än en repetition — annars finns det inget att vila mellan.

**Signaler** är ett val för alla tre händelserna (Gör dig redo, SKJUT, Klart):
pip, vibration eller båda. Det finns inget "ingetdera" — en timer du inte kan
uppfatta är ingen timer. Vill du tysta den använder du telefonens ljudlösa läge
(se nedan).

## Skottimer

En IPSC-liknande timer: en slumpmässig startfördröjning, en startsignal, och
mikrofonen som lyssnar efter dina skott för att registrera mellantider.

!!! warning "Skottdetekteringen är ännu inte pålitlig"

    Mikrofonen fångar upp långt mer än skott. En fingerknäpp eller ett
    tangentbord når full skala på mätaren, vilket betyder att en enkel
    ljudstyrketröskel inte kan skilja ditt skott från en dörr, en skytt bredvid
    eller banans eget ljud.

    Android lägger dessutom på automatisk förstärkningsreglering på mikrofonen,
    som lyfter svaga ljud och trycker ihop starka — precis fel form för att
    känna igen en impuls.

    Timern går att använda som timer. Betrakta skottdetekteringen som
    experimentell.

Samma val av **Signaler** som i tidsgränstimern — pip, vibration eller båda —
gäller alla dess fyra händelser: Är du redo?, Färdiga, startpipet och
stoppsignalen. Med ljud på läser **Talade kommandon** upp de två första på
appens språk i stället för att pipa; start och stopp förblir toner, eftersom
ett talat ord kommer sent och suddar ut ögonblicket då klockan startar.

Skärmen **Diagnostik för skottdetektering**, bakom ⋮-menyn i skottimern,
spelar in vad mikrofonen faktiskt hör, så att detekteringen kan arbetas vidare
med mot verkliga bandata i stället för mot gissningar.

## Fälttimer

SPSF:s kommandoserie för fältskytte, uppläst: standardkommandona i ordning, med
sina verkliga tider.

**Signaler per kommando**, hopfällt under inställningarna, låter dig välja hur
varje kommando når dig. Varje kommando kan vara den upplästa **Rösten** eller
ett **Pip**; tryck på det tända för att stänga av ljudet. **Vibrera** kan
läggas till vilket som helst av dem, eller stå för sig självt. Eld upphör kan
också vara en **Visselsignal** — den utdragna signalen som reglerna tillåter i
stället för det talade kommandot — och dess vibration kommer när tiden är ute,
i slutet av kommandot. Partigränser har inga ord, så de piper eller vibrerar.
Minst ett av ljud och vibration är alltid på för varje kommando.

Från början läses varje kommando upp, partierna piper, och telefonen vibrerar
vid eld, vid varje parti och när tiden är ute.

Du kan spola i sekvensen medan den är pausad och trycka på ett kommando för att
hoppa dit, och det är det som gör den användbar för träning och inte bara för
en skarp serie.

## Ljudlöst läge

Tidsgränstimern och fälttimern spelar sina signaler i telefonens
omgivningsljudsession, så ljudlös-knappen på en iPhone och ringsignalläget på
en Androidtelefon tystar dem. På iOS gäller det pipen, visselsignalen och de
talade kommandona lika. På Android gäller det pipen och visselsignalen; de
talade kommandona hörs ändå, eftersom Androids talsyntes inte har någon spärr
för ljudlöst läge. Vibration tystas aldrig av ljudlöst läge — det är hela
poängen med den.

Skottimern är undantaget: medan mikrofonen lyssnar spelas ljud även i ljudlöst
läge. Inspelning och respekt för ljudlöst läge kan inte dela en ljudsession på
iOS.

## Skärmen hålls tänd

Varje timer håller skärmen tänd så länge dess skärm är öppen — inte bara medan
en sekvens körs. Det är i pauserna en telefon låser sig för dig: medan ett
program ställs in, medan laget ropas fram, medan skott läses upp.
