# Vad träffbildens siffror betyder

När en serie är [räknad från foto](../guides/scoring-from-a-photo.md) vet
appen var varje hål sitter, inte bara vad det gav. Ur de lägena räknar den fram
träffbildens siffror: sida, höjd, medelradie, största spridning och de
förlorade poängen. De visas medan du markerar (från två hål), under fotot för
en räknad serie, i passets vy **Träffbild** och i passrapporten.

Alla avstånd är millimeter på tavlan.

## Var gruppen sitter: sida och höjd

Gruppens mitt är **medelträffpunkten**: medelläget för alla dess hål.

- **Sida** är hur långt den mitten ligger till höger (positivt) eller till
  vänster (negativt) om tavlans mitt.
- **Höjd** är hur långt den ligger över (positivt) eller under (negativt) den.

Tillsammans är de storleken och riktningen på en siktjustering, mätt på
tavlan. Appen räknar inte om dem till knäpp, eftersom hur långt ett knäpp
flyttar beror på ditt sikte och avståndet. Med bara några få skott flyttar ett
enda bortaskott mitten långt, så ta en justering från flera serier snarare än
en.

## Hur tät den är: medelradie och största spridning

- **Medelradie** är medelavståndet från varje hål till gruppens mitt. Varje
  hål väger lika, så ett enda bortaskott flyttar den bara lite. Den är det
  bättre måttet på hur jämnt du sköt.
- **Största spridning** är avståndet mellan de två hål som ligger längst
  ifrån varandra, mitt till mitt. Ett enda bortaskott avgör den på egen hand.

## Förlorade poäng

Appen tar gruppen precis som du sköt den, flyttar den så att dess mitt hamnar
i tavlans mitt och räknar den igen. Det ger tre siffror:

| Siffra               | Vad den är                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Potentiell poäng** | Vad samma grupp ger när den är centrerad.                                               |
| **Till läge**        | Potentiell poäng minus ditt faktiska resultat: vad en siktjustering skulle ge tillbaka. |
| **Till spridning**   | Högsta möjliga poäng minus potentiell poäng: vad spridningen kostar även centrerad.     |

Så ja: **Till läge** är ungefär vad du skulle ha haft med sida och höjd
justerade, eller genom att sikta dit felet pekar. **Till spridning** får ingen
siktjustering tillbaka, bara tätare skjutning.

Ett exempel: en femskottsserie ger 43 av 50. Centrerad skulle samma grupp ge 47. Då är 4 poäng förlorade till läge (47 − 43) och 3 till spridning
(50 − 47). Uppdelningen säger vilket problem du ska arbeta med: ett siktproblem
och ett teknikproblem kräver olika arbete.

### När det bara är en uppskattning

- **Den centrerar medelvärdet, inte den bästa platsen.** Appen letar inte
  efter den förflyttning som skulle ge mest; den flyttar gruppens medelläge
  till mitten. Förlorat till läge är en uppskattning, inget garanterat
  maximum.
- **Ett bortaskott snedvrider den.** Ett skott långt ut drar medelläget bort
  från en annars tät klunga. När det medelläget centreras hamnar klungan
  utanför mitten, och den potentiella poängen kan bli _lägre_ än det du
  faktiskt sköt. Appen visar då 0 förlorat till läge i stället för ett
  negativt tal. När den potentiella poängen är lägre än ditt resultat är ett
  bortaskott orsaken; titta på spridningssiffrorna i stället.
- **X räknas som en tia.** Den potentiella poängen är bara ringpoäng.

## Över ett pass

Passets vy **Träffbild** slår ihop alla serier som räknats från foto till en
grupp. Provserier är inte med, precis som de inte är med i passets resultat.
Dess förlorade poäng gäller alla de hålen tillsammans, så den potentiella
poängen gäller hela passets markerade skott, inte en serie. Från 20 hål kan
vyn växla mellan en plot av varje hål och en **värmekarta** som visar var de
samlas. Ett pass som skjutits på två tavlor, till exempel hela matchen i
Sportpistol, visar den tavla som har flest markerade hål.

## Att läsa värmekartan

Värmekartan breder ut varje hål till en mjuk fläck och lägger ihop fläckarna,
så där hålen trängs bygger färgen på. Den går från blått, där bara någon enstaka
träff hamnade, via grönt och gult till rött och vitt, där de flesta skotten
gick. Där ingen träffat förblir det genomskinligt, så ringarna och deras siffror
syns igenom. Färgerna är relativa till den tätaste platsen på just den tavlan,
inte ett antal: ett vitt centrum betyder "de flesta hamnade här", oavsett om det
är 20 hål eller 200. Samma värmekarta finns i passrapporten.

## Över flera pass

När statistikrapporten omfattar pass som räknats från foto slår
**Var dina skott hamnar** ihop deras hål för en gren och en tavla, den med
flest markerade hål, till en värmekarta. Under den säger appen, från 10
markerade skott, vilken av de två orsakerna som kostar dig mest:

- **Mest en siktjustering** när poängen förlorade till läge är mer än en och
  en halv gång de förlorade till spridning.
- **Mest jämnhet** när det är tvärtom.
- **Läge och spridning kostar ungefär lika mycket** när ingen av dem ligger
  så långt före.
- **Centrerad och tät** när mindre än en poäng går förlorad totalt.

Den läser bara hålen. Den ser inte ditt grepp, din siktbild eller om siktet
helt enkelt var felställt, och den försöker inte ställa diagnos på tekniken.
