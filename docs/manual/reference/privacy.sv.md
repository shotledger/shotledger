# Dina data och integritet

## Var de finns

I telefonen. Det finns inget konto, ingen registrering, och ingenting laddas
upp om du inte medvetet slår på något.

Det är standardläget och det sätt appen är tänkt att användas på.

## Vad som lämnar telefonen, och bara om du ber om det

| Funktion                             | Vad som skickas, och vart                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Synk** (valfritt)                  | Din loggbok, dess taggar, och ditt födelseår, din klass, ditt val om damklasser och din efterlevnadsprofil, till synktjänsten, så att en andra enhet kan dela dem. Övriga inställningar stannar i enheten. Avstängd om du inte skapar ett konto.                                                                                                                                                                                                        |
| **Webbappen** (valfritt)             | Inget nytt: den läser det synken redan lagrar, in i fliken du loggar in från, och sparar inget när fliken stängs: ingen kaka, och servern avslutar inloggningen efter 12 timmar. Ett pass du matar in eller en inställning du ändrar där lagras som synken lagrar dem från telefonen; ett foto av tavlan du lägger till där förminskas och sparas om först, utan platsuppgifter, som telefonen gör. En nedladdning hamnar där webbläsaren sparar filer. |
| **Webshooter**                       | Ditt Webshooter-lösenord en gång, därefter en token, direkt från telefonen till webshooter.se. Aldrig via någon ShotLedger-server.                                                                                                                                                                                                                                                                                                                      |
| **Förslag på skjutbanor** (valfritt) | Det du skriver i passets platsfält går till en geokodningstjänst; "Använd min position" skickar dina koordinater till en karttjänst. Avstängt som standard.                                                                                                                                                                                                                                                                                             |
| **Säkerhetskopior**                  | Dit du än skickar filen. Det är helt och hållet ditt val.                                                                                                                                                                                                                                                                                                                                                                                               |

## Vad som aldrig lämnar telefonen

- **Tavelfoton**, om du inte tar med dem i en säkerhetskopia som du själv
  flyttar, eller slår på synk.
- **Foton av licenskort.** När du skannar ett fylls licensfälten i och fotot
  raderas sedan — appen har ingenstans att spara det.
- **Träningsmarkeringar**, om du väljer att spara dem. De stannar på enheten
  för att träna en framtida håldetektor, och du kan radera dem.
