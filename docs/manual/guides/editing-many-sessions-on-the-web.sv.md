# Ändra flera pass på webben

Med synk påslagen kan webbappen ändra många pass på en gång: tagga en hel
säsong, rätta vilket vapen en rad pass sköts med, eller flytta pass till en
annan plats. Logga in och öppna **Ändra flera pass** i menyn till vänster.

## Välj passen

Sidan listar alla pass, nyaste först. Begränsa listan med **Från**, **Till**
och **Sök pass** (ett pass namn, plats eller taggar) och markera sedan passen
som ska ändras. Rutan överst i listan markerar eller avmarkerar alla pass som
visas.

En ändring gäller de markerade pass som listan visar. Pass du markerade och
sedan filtrerade bort lämnas orörda.

## Välj ändring

| Ändring        | Vad den gör                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| Lägg till tagg | Lägger till taggen på varje pass. Ett namn du inte använt förut blir en ny tagg |
| Ta bort tagg   | Tar bort en av de markerade passens taggar från vart och ett av dem             |
| Byt vapen      | Sätter vapnet, eller **Ingen**                                                  |
| Byt plats      | Sätter platsen. En tom plats rensar den                                         |

**Byt vapen** flyttar skottantalen med passen, som när du ändrar ett pass i
telefonen: varje pass skott, provskott inräknade, dras från det gamla vapnets
skottantal och läggs på det nyas.

## Tillämpa

Knappen skickar hela ändringen på en gång; den görs helt eller inte alls, och
telefonen får den vid nästa synk. Sidan säger sedan hur många pass som
ändrades och hur många som redan var så.

Ett pass som under tiden tagits bort på en annan enhet lämnas utanför, och
sidan säger det. Om det skulle flyttas till ett annat vapen drar sidan sedan
tillbaka dess skott från skottantalen, så att de bara räknar passen som
flyttades. En tagg som under tiden tagits bort på en annan enhet syns inte på
passen; det säger sidan också.

Att tillämpa kräver en anslutning. Om servern inte går att nå skickar
**Försök igen** exakt samma ändring igen, så att inget ändras två gånger. Om
du stänger fliken innan dess försvinner ändringen. Om skottantalen fortfarande
behöver rättas gör **Försök igen** det, och inget annat kan tillämpas förrän
det är gjort.

Sidan läser loggboken på nytt precis innan den skickar, men en ändring som
görs i telefonen i samma stund kan ändå gå förlorad, och likaså webbens: den
senare sparningen av ett pass eller ett vapen vinner. Det gäller framför allt
skottantal. Att spara serier i telefonen medan ett vapenbyte väntar på
**Försök igen** kan tappa de skotten ur antalet, så låt webben bli klar först.

En ändring kan röra högst 500 rader. Behövs fler säger sidan hur många, och
du markerar färre pass och tillämpar två gånger.

Att slå ihop dubbla ammunitionspartier finns inte här än.
