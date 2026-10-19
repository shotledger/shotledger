# Dina data och integritet

## Var de finns

I telefonen. Du behöver inget konto, och ingenting laddas upp om du inte
medvetet slår på något.

Det är standardläget och det sätt appen är tänkt att användas på. Den formella
[integritetspolicyn](privacy-policy.md) och [användarvillkoren](terms.md) för
den valfria synktjänsten säger samma sak i sin helhet.

## Vad som lämnar telefonen, och bara om du ber om det

| Funktion                             | Vad som skickas, och vart                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Synk** (valfritt)                  | Din loggbok, dess taggar, och ditt födelseår, din klass, ditt val om damklasser och din efterlevnadsprofil, till synktjänsten, så att en andra enhet kan dela dem. Övriga inställningar stannar i enheten. Avstängd om du inte skapar ett konto.                                                                                                                                                                                                        |
| **Webbappen** (valfritt)             | Inget nytt: den läser det synken redan lagrar, in i fliken du loggar in från, och sparar inget när fliken stängs: ingen kaka, och servern avslutar inloggningen efter 12 timmar. Ett pass du matar in eller en inställning du ändrar där lagras som synken lagrar dem från telefonen; ett foto av tavlan du lägger till där förminskas och sparas om först, utan platsuppgifter, som telefonen gör. En nedladdning hamnar där webbläsaren sparar filer. |
| **Webshooter**                       | Ditt Webshooter-lösenord en gång, därefter en token, direkt från telefonen till webshooter.se. Aldrig via någon ShotLedger-server.                                                                                                                                                                                                                                                                                                                      |
| **Förslag på skjutbanor** (valfritt) | Det du skriver i passets platsfält går till en geokodningstjänst; "Använd min position" skickar dina koordinater till en karttjänst. Avstängt som standard.                                                                                                                                                                                                                                                                                             |
| **Appuppdateringar**                 | Appens version, plattform och ett slumpmässigt installations-id, till Expos uppdateringstjänst när appen startar, så att rättningar kan komma utan en uppdatering i butiken. Ingenting ur din loggbok.                                                                                                                                                                                                                                                  |
| **Säkerhetskopior**                  | Dit du än skickar filen. Det är helt och hållet ditt val.                                                                                                                                                                                                                                                                                                                                                                                               |

## Vad som aldrig lämnar telefonen

- **Tavelfoton**, om du inte tar med dem i en säkerhetskopia som du själv
  flyttar, eller slår på synk.
- **Foton av licenskort.** När du skannar ett fylls licensfälten i och fotot
  raderas sedan — appen har ingenstans att spara det. Texten läses i telefonen
  av Google ML Kit, som skickar mätdata om användning och prestanda till
  Google, aldrig bilden eller texten.
- **Träningsmarkeringar**, om du väljer att spara dem. De stannar på enheten
  för att träna en framtida håldetektor, och du kan radera dem.
