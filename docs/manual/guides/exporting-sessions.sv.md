# Exportera och importera pass

**Inställningar → Säkerhetskopiering och data → Passexport.** En JSON-fil som rymmer varje pass, serie,
skott och fältstation, plus vapnen och licenserna bakom dem.

Det är inte samma sak som en [säkerhetskopia](backup-and-restore.md). En
säkerhetskopia är hela appen — inställningar, foton, underhåll, taggar — och
finns för att du ska kunna få tillbaka telefonen som den var, genom att ersätta
allt som finns på enheten. En passexport är skjutandet och utrustningen det
gjordes med, i ett dokumenterat format, så att något annat kan läsa det och så
att det går att foga in i en installation som redan har data.

## Att exportera

**Exportera pass** skriver filen och lämnar över den till delningsrutan. Alla
pass följer med; det finns inget datumintervall att välja.

## Att importera

**Importera pass** tar en fil och lägger till eller uppdaterar pass från den,
tillsammans med de vapen och licenser den bär. Innan något skrivs visas vad som
kommer att hända: hur många pass som skapas och uppdateras, och hur många nya
vapen, licenser och ammunitionspartier.

Pass matchas på sitt id, så att importera samma fil två gånger dubblerar
ingenting — den andra importen uppdaterar det den första skapade. Det gör det
riskfritt att importera om en fil du är osäker på.

Vapen, licenser och underhållsposter matchas på samma sätt, på sitt id. Ett vapen som filen bär
och som inte redan finns här skapas med allt filen vet om det — kaliber,
vapentyp, tillverkningsnummer, VapenID, laddsystem — och sina licenser med sig.
Ett vapen vars id är okänt men vars fabrikat och modell redan stämmer med ett på
enheten behandlas som det vapnet i stället för som en andra kopia av det, och
lämnas som det är.

Skotträknarna är det enda en import inte skriver över på ett vapen du redan har.
Filen är ett register över skjutande, inte sanningen om hur många skott den här
enheten har räknat genom vapnet.

Ett vapen som importen skapar är tvärtom: det får sina skotträknare från filen,
och de innehåller redan filens pass. Att återställa en fullständig export i en
tömd app ger därför varje vapen tillbaka exakt de räknare det hade, inte
räknarna plus dess pass en gång till.

På ett vapen du redan har räknas passen den hämtar in däremot. Varje importerat
pass lägger sina skott, sina oräknade extraskott och sex skott för varje
fältstation till räknarna för det vapen det anger — precis som om du hade
loggat passet här. Att importera samma fil två gånger räknar den inte
två gånger: den andra importen flyttar räknarna med skillnaden, och oftast inte
alls.

Pass som kom från WebShooter eller ShotLog behåller sin koppling till källan
genom en export och import. Återställer du en fil i en tömd app och sedan
importerar från WebShooter eller ShotLog igen uppdateras de passen i stället
för att läggas till en gång till.

Appen avvisar en fil vars `formatVersion` är **högre** än den förstår, i stället
för att importera de delar den känner igen. En delvis import som ser lyckad ut
är sämre än ett avvisande, eftersom du inte skulle veta vad som föll bort.

## Formatet

Validera en fil mot det publicerade schemat:

[**sessions-export.schema.json**](../reference/sessions-export.schema.json)
{ .md-button }

Schemat genereras ur samma definitioner som appen validerar importer mot, så
det kan inte glida ifrån det appen faktiskt accepterar. Varje fält bär en
beskrivning där, vilket är snabbaste vägen till svar på "vad är det här värdet".

**Två URL:er, och skillnaden spelar roll om du bygger mot dem:**

| URL                                        | Beskriver                                               |
| ------------------------------------------ | ------------------------------------------------------- |
| `reference/sessions-export.schema.json`    | vad `formatVersion` än är just nu — i dag **1**         |
| `reference/v1/sessions-export.schema.json` | formatversion **1**, och kommer inte att byta betydelse |

Lås dig vid den versionerade. Den första URL:en är den bekväma att läsa, men
den dag en `formatVersion` 2 finns börjar den beskriva den i stället, och en fil
som validerade i går validerar inte i dag.

### Ett kort exempel

Ett pass, en räknande serie om tre skott:

```json
{
  "format": "shotledger.sessions",
  "formatVersion": 1,
  "generatedAt": "2026-09-12T18:30:00.000Z",
  "app": { "name": "ShotLedger", "version": "0.1.0" },
  "sessions": [
    {
      "id": "0d8f1c2e-4a7b-4c1d-9f3e-2b6a5c9d8e70",
      "name": "Tisdagsträning",
      "type": "training",
      "kind": "series",
      "disciplineId": "spsf-precision",
      "programId": "spsf-precision-standard",
      "competitionLevel": null,
      "isChampionship": false,
      "competitionName": null,
      "weaponGroup": "spsf:C",
      "shooterClass": "2",
      "eventId": null,
      "firearmId": "b4a1f6d2-0c33-4f1e-9a77-1d2e3f4a5b6c",
      "firearm": "Pardini SP",
      "ammoLot": "Eley Match lot 22-114",
      "startedAt": "2026-09-12T17:00:00.000Z",
      "location": "Malmö Skyttegille",
      "notes": null,
      "decimalScoring": false,
      "seriesLength": null,
      "extraRounds": null,
      "tags": ["träning"],
      "series": [
        {
          "position": 1,
          "isSighter": true,
          "isFinal": false,
          "shots": [],
          "totalOverride": null
        },
        {
          "position": 2,
          "isSighter": false,
          "isFinal": false,
          "shots": [
            { "position": 1, "valueTenths": 100, "isInnerTen": true },
            { "position": 2, "valueTenths": 90, "isInnerTen": false },
            { "position": 3, "valueTenths": 80, "isInnerTen": false }
          ],
          "totalOverride": null
        }
      ],
      "faltResultMode": null,
      "stations": [],
      "externalSource": null,
      "externalRef": null,
      "officialPlacement": null,
      "officialStandardMedal": null
    }
  ],
  "firearms": [
    {
      "id": "b4a1f6d2-0c33-4f1e-9a77-1d2e3f4a5b6c",
      "make": "Pardini",
      "model": "SP",
      "caliber": ".22 LR",
      "weaponType": "pistol",
      "isOwn": true,
      "serialNumber": null,
      "vapenId": null,
      "loadSystem": null,
      "notes": null,
      "roundCount": 1200,
      "maintenanceIntervalRounds": 500,
      "maintenanceIntervalMonths": 6
    }
  ],
  "licenses": [
    {
      "id": "9f0e1d2c-3b4a-4958-8776-6a5b4c3d2e1f",
      "firearmId": "b4a1f6d2-0c33-4f1e-9a77-1d2e3f4a5b6c",
      "licenseNumber": "A123.456/2026-01",
      "purpose": "Målskjutning",
      "decidedOn": "2026-01-15",
      "validUntil": null,
      "conditions": null,
      "authority": "Polismyndigheten"
    }
  ],
  "maintenanceEvents": [
    {
      "id": "0192c4a1-7e2b-7c3d-9a10-4b5c6d7e8f90",
      "firearmId": "b4a1f6d2-0c33-4f1e-9a77-1d2e3f4a5b6c",
      "performedAt": "2026-05-02T16:00:00.000Z",
      "kind": "Rengöring",
      "roundCountAt": 1080,
      "isAdjustment": false,
      "notes": null
    }
  ]
}
```

### Att läsa fälten

| Fält                                         | Betydelse                                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valueTenths`                                | Skottets värde i **tiondelar**, så en tia är `100` och en decimaltia 10,9 är `109`. Heltal rakt igenom — inga flyttal i ett resultat.                                                                                                                           |
| `isInnerTen`                                 | Om skottet var en innertia. Skilt från värdet, eftersom en innertia ger samma poäng som en tia.                                                                                                                                                                 |
| `isSighter`                                  | En provserie. Den bär inga skott här och räknas inte mot någon total.                                                                                                                                                                                           |
| `totalOverride`                              | En serie som bara sparats som en total, så som en import från Webshooter eller ShotLog ger den: `tenths` är totalen, `shotCount` antalet skott bakom den eller `null` när inget angavs. Dess `shots` är då tom. `null` på en serie som räknats skott för skott. |
| `weaponGroup`                                | Det förbundsprefixade id:t, t.ex. `spsf:C`. Se [Vapengrupp och klass](../reference/weapon-group-and-class.md).                                                                                                                                                  |
| `eventId`                                    | ISSF-grenen, t.ex. `issf-air-pistol:women:open`. `null` för ett SPSF-pass, som bär en klass i stället.                                                                                                                                                          |
| `seriesLength`                               | Skott per serie som valdes när passet skapades. `null` när hela matchen anger den, och på ett pass som inte skjuts i ringade serier.                                                                                                                            |
| `firearmId`                                  | Vapnet i filens `firearms`-lista som passet sköts med, eller `null`.                                                                                                                                                                                            |
| `firearm`                                    | Samma vapens fabrikat och modell som en enda sträng. Behålls bredvid id:t så att en fil vars `firearms`-lista inte rymmer det ändå säger vad som sköts med.                                                                                                     |
| `stations`                                   | Ett fältskjutningspass stationer: träffar, träffade figurer, stationens antal figurer, eventuella poängmålspoäng och deras max, och om stationen struks eller sköts som särskjutning. Tom på alla andra pass.                                                   |
| `faltResultMode`                             | `falt` eller `poangfalt` — hur fältomgången redovisas. `null` på alla andra pass.                                                                                                                                                                               |
| `kind`                                       | `series` för ett pass som loggas i räknade serier, `rounds` för ett som bara anger ett antal avlossade skott, i `extraRounds`. En fil utan fältet läses som `series`.                                                                                           |
| `externalSource`, `externalRef`              | Var ett importerat pass kom ifrån (`webshooter`, `shotlog`) och källans egen nyckel för det, utan källan framför (`363:35937`). En senare import från samma källa matchar på paret. `null` på ett pass som loggats i appen.                                     |
| `officialPlacement`, `officialStandardMedal` | Placering och standardmedalj ur de officiella resultaten, så som en import från WebShooter förde in dem. `null` när det inte finns några.                                                                                                                       |

### Vapen, licenser och underhåll

Kuvertet bär tre listor till vid sidan av `sessions`:

- **`firearms`** — en post per vapen, med allt appen lagrar om det: fabrikat,
  modell, kaliber, vapentyp, om det är ditt eget, tillverkningsnummer,
  VapenID, laddsystem, anteckningar, avlossade skott och underhållsintervall (i
  skott och i månader).
- **`licenses`** — en post per **utfärdad** licens, var och en med sitt vapen
  angivet genom `firearmId`. En förnyelse är en egen post i stället för en
  ändring av den gamla, så historiken bevaras.
- **`maintenanceEvents`** — varje vapens underhållslogg, justeringar av
  skotträknaren medräknade (`isAdjustment`). `roundCountAt` är vapnets
  skotträknare när posten loggades, och `performedAt` är datum och tid i UTC
  enligt ISO 8601, som `startedAt` för ett pass; en post med bara ett datum,
  eller med en tidszonsförskjutning, hoppas över vid import. **Skott sedan
  underhåll** lagras inte i filen: det räknas fram ur de här posterna, på
  samma sätt som appen gör, så det blir detsamma efter en import.

En licens eller underhållspost som pekar ut ett vapen filen inte bär utelämnas
vid import: den har inget att höra till, och att gissa fram ett vore sämre än
att hoppa över den.

!!! note "Vad en export inte är"

    Den bär inga foton och inga inställningar. Att
    importera en i en ny installation ger dig skjutandet och utrustningen bakom
    det, men inte en telefon återställd som den var — för det återställer du en
    säkerhetskopia.
