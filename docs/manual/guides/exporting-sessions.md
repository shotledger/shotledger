# Exporting and importing sessions

**Settings → Backup & Data → Sessions Export.** One JSON file holding every session, series,
shot and fält station, plus the firearms and licenses behind them.

This is not the same thing as a [backup](backup-and-restore.md). A backup is
the whole app — settings, photos, maintenance, tags — and exists so you can put
your phone back the way it was, replacing whatever is on the device. A sessions
export is the shooting and the equipment it was done with, in a documented
format, so something else can read it and so it can be merged into an install
that already has data.

## Exporting

**Export Sessions** writes the file and hands it to the share sheet. Every
session goes in; there is no date range to choose.

## Importing

**Import Sessions** takes a file and adds or updates sessions from it, together
with the firearms and licenses it carries. Before anything is written you are
shown what it will do: how many sessions to create and update, and how many new
firearms, licenses and ammunition lots.

Sessions are matched on their id, so importing the same file twice does not
duplicate anything — the second import updates what the first created. That
makes it safe to re-import a file you are not sure about.

Firearms and licenses are matched the same way, on their id. A firearm the file
carries that is not here yet is created with everything the file knows about it
— caliber, weapon type, serial number, VapenID, load system — and its licenses
with it. A firearm whose id is unknown but whose make and model already match
one on the device is treated as that firearm rather than a second copy of it,
and is left as it is.

Round counts are the one thing an import will not overwrite on a firearm you
already have. The file is a record of shooting, not the authority on how many
rounds this device has counted through that firearm.

The sessions it brings in do count, though. Each imported session adds its
shots, its unscored extra rounds and six rounds for every fält station to the counters of the firearm it names —
the same as if you had logged it here. Importing the same file twice does not
count it twice: the second import moves the counters by the difference, and
usually by nothing at all.

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
      ],
      "faltResultMode": null,
      "stations": []
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
      "roundsSinceMaintenance": 120
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
  ]
}
```

### Reading the fields

| Field            | Meaning                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valueTenths`    | The shot value in **tenths**, so a 10 is `100` and a decimal 10.9 is `109`. Integers throughout — no floating point in a score.                                                        |
| `isInnerTen`     | Whether the shot was an inner ten. Separate from the value, because an inner ten scores the same as a ten.                                                                             |
| `isSighter`      | A sighting series. It carries no shots here and does not count towards a total.                                                                                                        |
| `weaponGroup`    | The federation-scoped id, e.g. `spsf:C`. See [Weapon group and class](../reference/weapon-group-and-class.md).                                                                         |
| `eventId`        | The ISSF event, e.g. `issf-air-pistol:women:open`. `null` for an SPSF session, which carries a class instead.                                                                          |
| `seriesLength`   | Shots per series chosen when the session was created. `null` when a full match sets it instead, and on a session not scored in ring series.                                            |
| `firearmId`      | The firearm in the file's `firearms` array that the session was shot with, or `null`.                                                                                                  |
| `firearm`        | The same firearm's make and model as one string. Kept beside the id so a file whose `firearms` array does not hold it still says what was shot with.                                   |
| `stations`       | A fältskjutning session's stations: hits, figures hit, any poängmål points and their max, and whether the station was scratched or shot as a särskjutning. Empty on any other session. |
| `faltResultMode` | `falt` or `poangfalt` — how the fält round is reported. `null` on any other session.                                                                                                   |

### Firearms and licenses

The envelope carries two more arrays beside `sessions`:

- **`firearms`** — one entry per firearm, with everything the app stores about
  it except its maintenance history: make, model, caliber, weapon type, whether
  it is your own, serial number, VapenID, load system, notes and round counts.
- **`licenses`** — one entry per **issued** license, each naming its firearm
  through `firearmId`. A renewal is its own entry rather than an edit of the
  old one, so the history is kept.

A license that names a firearm the file does not carry is dropped on import: it
has nothing to belong to, and guessing at one would be worse than leaving it
out.

!!! note "What an export is not"

    It carries no photographs, no maintenance history and no settings.
    Importing one into a fresh install gives you the shooting and the equipment
    behind it, but not a phone put back the way it was — for that, restore a
    backup.
