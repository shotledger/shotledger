# Exportera och importera pass

**Inställningar → Säkerhetskopiering och data → Passexport.** En JSON-fil som rymmer varje pass, serie och
skott.

Det är inte samma sak som en [säkerhetskopia](backup-and-restore.md). En
säkerhetskopia är hela appen — vapen, ammunition, licenser, inställningar,
foton — och finns för att du ska kunna få tillbaka telefonen som den var. En
passexport är bara skjutandet, i ett dokumenterat format, så att något annat
kan läsa det.

## Att exportera

**Exportera pass** skriver filen och lämnar över den till delningsrutan. Alla
pass följer med; det finns inget datumintervall att välja.

## Att importera

**Importera pass** tar en fil och lägger till eller uppdaterar pass från den.

Pass matchas på sitt id, så att importera samma fil två gånger dubblerar
ingenting — den andra importen uppdaterar det den första skapade. Det gör det
riskfritt att importera om en fil du är osäker på.

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
  "app": { "name": "ShotLedger", "version": "1.0.0" },
  "sessions": [
    {
      "id": "0d8f1c2e-4a7b-4c1d-9f3e-2b6a5c9d8e70",
      "name": "Tisdagsträning",
      "type": "training",
      "disciplineId": "spsf-precision",
      "programId": "spsf-precision-standard",
      "competitionLevel": null,
      "isChampionship": false,
      "competitionName": null,
      "weaponGroup": "spsf:C",
      "shooterClass": "2",
      "eventId": null,
      "firearm": "Pardini SP",
      "ammoLot": "Eley Match lot 22-114",
      "startedAt": "2026-09-12T17:00:00.000Z",
      "location": "Malmö Skyttegille",
      "notes": null,
      "decimalScoring": false,
      "extraRounds": null,
      "tags": ["träning"],
      "series": [
        {
          "position": 1,
          "isSighter": true,
          "isFinal": false,
          "shots": []
        },
        {
          "position": 2,
          "isSighter": false,
          "isFinal": false,
          "shots": [
            { "position": 1, "valueTenths": 100, "isInnerTen": true },
            { "position": 2, "valueTenths": 90, "isInnerTen": false },
            { "position": 3, "valueTenths": 80, "isInnerTen": false }
          ]
        }
      ]
    }
  ]
}
```

### Att läsa fälten

| Fält          | Betydelse                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `valueTenths` | Skottets värde i **tiondelar**, så en tia är `100` och en decimaltia 10,9 är `109`. Heltal rakt igenom — inga flyttal i ett resultat. |
| `isInnerTen`  | Om skottet var en innertia. Skilt från värdet, eftersom en innertia ger samma poäng som en tia.                                       |
| `isSighter`   | En provserie. Den bär inga skott här och räknas inte mot någon total.                                                                 |
| `weaponGroup` | Det förbundsprefixade id:t, t.ex. `spsf:C`. Se [Vapengrupp och klass](../reference/weapon-group-and-class.md).                        |
| `eventId`     | ISSF-grenen, t.ex. `issf-air-pistol:women:open`. `null` för ett SPSF-pass, som bär en klass i stället.                                |
| `firearm`     | Vapnets fabrikat och modell som en enda sträng, eller `null`. En export namnger utrustning; den bär inte med sig din vapenlista.      |

!!! note "Vad en export inte är"

    Den bär inga foton, inga vapen- eller ammunitionsposter, inga licenser och
    ingenting från Valvet. Att importera en i en ny installation ger dig
    skjutandet, inte utrustningen bakom det — för det återställer du en
    säkerhetskopia.
