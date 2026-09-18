# Exporting and importing sessions

**Settings → Backup & Data → Sessions Export.** One JSON file holding every session, series
and shot.

This is not the same thing as a [backup](backup-and-restore.md). A backup is
the whole app — firearms, ammunition, licences, settings, photos — and exists
so you can put your phone back the way it was. A sessions export is just the
shooting, in a documented format, so something else can read it.

## Exporting

**Export Sessions** writes the file and hands it to the share sheet. Every
session goes in; there is no date range to choose.

## Importing

**Import Sessions** takes a file and adds or updates sessions from it.

Sessions are matched on their id, so importing the same file twice does not
duplicate anything — the second import updates what the first created. That
makes it safe to re-import a file you are not sure about.

The app refuses a file whose `formatVersion` is **higher** than it
understands, rather than importing the parts it recognises. A partial import
that looks successful is worse than a refusal, because you would not know what
was dropped.

## The format

Validate a file against the published schema:

[**sessions-export.schema.json**](../reference/sessions-export.schema.json)
{ .md-button }

The schema is generated from the same definitions the app validates imports
against, so it cannot drift from what the app actually accepts. Every field
carries a description there, which is the quickest way to answer "what is this
value".

**Two URLs, and the difference matters if you are building against it:**

| URL                                        | Describes                                             |
| ------------------------------------------ | ----------------------------------------------------- |
| `reference/sessions-export.schema.json`    | whatever the current `formatVersion` is — today **1** |
| `reference/v1/sessions-export.schema.json` | format version **1**, and will not change meaning     |

Pin the versioned one. The first URL is the convenient one to read, but the day
a `formatVersion` 2 exists it starts describing that instead, and a file that
validated yesterday will not validate today.

### A short example

One session, one scored series of three shots:

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

### Reading the fields

| Field         | Meaning                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `valueTenths` | The shot value in **tenths**, so a 10 is `100` and a decimal 10.9 is `109`. Integers throughout — no floating point in a score. |
| `isInnerTen`  | Whether the shot was an inner ten. Separate from the value, because an inner ten scores the same as a ten.                      |
| `isSighter`   | A sighting series. It carries no shots here and does not count towards a total.                                                 |
| `weaponGroup` | The federation-scoped id, e.g. `spsf:C`. See [Weapon group and class](../reference/weapon-group-and-class.md).                  |
| `eventId`     | The ISSF event, e.g. `issf-air-pistol:women:open`. `null` for an SPSF session, which carries a class instead.                   |
| `firearm`     | The firearm's make and model as one string, or `null`. An export names equipment; it does not carry your firearms list.         |

!!! note "What an export is not"

    It carries no photographs, and no firearms, ammunition or licence records.
    Importing one into a fresh install gives you the shooting, not the
    equipment behind it — for that, restore a backup.
