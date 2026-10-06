# Hur appen hittar hålen

[Räkna från foto](../guides/scoring-from-a-photo.sv.md) är uppgiften, och
[vad fotoräkningen gör](photo-scoring.sv.md) förklarar varför den slutar där den
slutar. Den här sidan handlar om vad som händer mellan att du tar fotot och att
de streckade markeringarna syns, och var varje steg kan gå fel.

## Först måste den hitta tavlan

Ett hål går att räkna först när appen vet var tavlans mittpunkt är, hur många
pixlar som går på en millimeter och hur snett fotot togs. På 25 m
precisionstavlan har den två sätt att ta reda på det.

**Från svartens kant.** Det svarta fältet är en skiva med 200 mm diameter.
Appen letar efter det största mörka, ungefär runda området i fotot och anpassar
en oval till dess kant. Ovalen ger mittpunkten, skalan och vinkeln du
fotograferade från. Sedan justerar den de ritade ringarna tills de ligger på de
tryckta ringlinjerna.
Justeringen rättar storleken med högst en åttondel, så en oval i fel
storlek lämnar ringarna mellan de tryckta linjerna. Därför letar appen efter de
tryckta linjerna upp till en halv ring på vardera sidan om sina 10-, 9- och
8-ringar, och avvisar anpassningen om någon av de tre ligger mer än 4,5 mm fel.

**Från ringlinjerna.** En närbild av niorna och tian har ingen svart kant, så
det första sättet har inget att hålla sig i. Det andra utnyttjar i stället en
egenskap hos tavlan: varje ringlinje ligger ett helt antal gånger 25 mm från
mitten. Appen letar upp den punkt som alla krökta linjer i fotot är centrerade
kring, mäter avståndet mellan linjerna och anpassar ringarna efter dem. Den
behöver aldrig läsa någon ringsiffra.

En milsnabbtavlas ringlinjer kan lura det andra sättet. En närbild av dess X
och tia har samma mönster i förhållandet 1:2 som precisionstavlans, i dubbel
storlek. Därför gör appen tre kontroller till i en precisionssession innan den
använder en anpassning efter ringlinjerna. Den avvisar anpassningen om ringarna
bara stämmer vid en lutning som inget foto av en plan tavla har. Den avvisar
den om milsnabbtavlans egen anpassning också fungerar på fotot. Och den avvisar
den om hålen blir ungefär hälften så stora som din kaliber ger. Finns det inga
hål att mäta kan den sista kontrollen inte hjälpa. Då kan ett milsnabbfoto
fortfarande slinka igenom, oftast en tät närbild av X och tian.

För dem letar appen efter precisionstavlans X-ring: den tunna linjen inuti tian
som en milsnabbtavla saknar. Hittar den ingen linje där frågar den vilken tavla
du har fotograferat. Den frågar en gång per session och minns svaret tills
appen stängs. Svarar du **Militär snabbmatch** avvisas anpassningen efter
ringlinjerna, som när någon av kontrollerna ovan avvisar den. Lappar över en
välskjuten mitt kan också dölja X-linjen, så ibland får även ett precisionsfoto
frågan; svarar du **Precision** fortsätter räkningen som vanligt. Milsnabb
räknas ändå bäst i en milsnabbsession.

Båda sätten provas. Vart och ett måste klara sina egna kontroller: ringarna det
ritar ska ligga på tryckta linjer, inom en halv millimeter. Klarar båda det
använder appen det vars ringar ligger närmast linjerna. Klarar inget av dem det
ber den dig sätta ut [fyra punkter på en ring](../guides/scoring-from-a-photo.sv.md#sa-gor-du).

## Sedan rätar den upp fotot

När tavlan är hittad ritar appen om fotot som om det tagits rakt framifrån, med
fyra pixlar per millimeter. Därefter är ett .22-hål alltid lika stort i bilden,
hur nära eller långt bort telefonen än var. Alla följande steg arbetar på den
här upprätade kopian.

## Sedan letar den efter hål

Att hitta hålen sker i två steg: först allt som kan vara ett hål, sedan en
bedömning av varje.

**Allt som kan vara ett hål.** Ett filter inställt på kulans storlek lyser upp
runda fläckar av ungefär den storleken: ljusa på det svarta, där papperet syns
igenom, och mörka på det vita. Ett vanligt foto ger ett hundrasextiotal. Det
fångar nästan alla verkliga hål, men de flesta fläckarna är något annat.

**En bedömning av varje.** Varje fläck mäts på ett trettiotal sätt. Rivet papper
är strävt och en lapp är slät. En lapp eller en tryckt siffra har raka kanter,
det har inte ett hål. En siffra hör till en lång tryckt form, ett hål står för
sig självt. Måtten går in i en formel som anpassats på verkliga tavlor där
varje hål markerats för hand. Formeln ger varje fläck en sannolikhet att vara
ett hål, och bara de säkra blir streckade markeringar. Två markeringar som
ligger närmare varandra än ett hål slås ihop.

Hittar appen långt fler hål än serien har skott har den missförstått fotot. Då
säger den det och föreslår ingenting, i stället för att täcka tavlan med
markeringar som du får radera.

## Din tryckning får samma hjälp

Fingertoppen täcker hålet den siktar på. När du trycker letar appen därför
efter ett hål inom några millimeter och flyttar markeringen till dess mitt, men
bara om en liten kontroll av hål eller lapp håller med om att det är ett hål.
Annars stannar markeringen där du tryckte.

## Poängen tas från hålets kant

Regelboken räknar ett hål till det högre värdet så snart det tangerar
ringlinjen (SHB F.6.10.1). Appen mäter därför från den kant av hålet som ligger
närmast mitten, inte från hålets mitt: avståndet till mitten minus halva
kulans diameter, som kommer från kalibern. Ett hål vars kant ligger inom en
millimeter från en linje flaggas, så att du kan avgöra själv.

## Det som fortfarande ställer till det

- **Hål i det vita**, och hål som går i varandra, är de den oftast missar.
- **En hårt lagad tavla.** Gamla lappar är det vanligaste falska hålet, och en
  spegel som är mer lapp än papper döljer också de verkliga hålen.
- **En spegel som klistrats över en hel tavla.** Två uppsättningar ringlinjer
  kan lura appen om var ringarna ligger, eller hur stora de är. Kontrollera att
  den innersta ritade ringen ligger på den tryckta tian innan du litar på
  poängen.
- **Andra tavlor.** Allt detta är uppmätt på 25 m precisionstavlan. På alla
  andra tavlor sätter du ut de fyra punkterna och markerar varje hål.

Inget av detta är en gräns som bara går att vrida på. Nästa förbättring kräver
fler verkliga, handgranskade tavlor, och det är vad
[att spara dina markeringar som träningsdata](photo-scoring.sv.md#att-hjalpa-den-bli-battre)
är till för.
