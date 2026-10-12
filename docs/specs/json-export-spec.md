# SPEC — JSON export and import, replacing CSV

**Status: REVISION 2 — DRAFT, awaiting maintainer approval. No implementation
until approved.**

Tier 3 (data loss / import correctness / public file format). `shared/src/csv/`
is under the old-coder evidence-first rule, so its replacement is too.

Source: issue #138, "I think we should export and import as JSON or YAML and not
CSV".

## Changes since revision 1

Revision 1 asked three questions. The answers changed the spec, so it is re-shown
here for approval rather than treated as already approved.

| Question                       | Answer                                                                                 | Effect                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CSV stays or goes?             | _"JSON only. no CSV… there are no existing user to consider so no csv import needed."_ | **CSV is deleted outright**, app layer included. Revision 1 recommended keeping the reader; that recommendation is withdrawn. |
| `json5` approved?              | _"just do plain json for now."_                                                        | **No new dependency. The comments toggle is dropped**, and with it criteria 8, 14 and property 22.                            |
| Existing session id on import? | not answered                                                                           | Assumption stated in §6, still open.                                                                                          |

**On the side question — JSON5 and JSONC are not the same.** JSONC is JSON plus
comments (and, in most implementations, trailing commas) — what `tsconfig.json`
uses. JSON5 is a far larger superset: comments _and_ unquoted keys, single
quotes, hex numbers, leading/trailing decimal points, `Infinity`/`NaN`,
multi-line strings. Both need a parser; neither is readable by `JSON.parse`.
Plain JSON avoids the question entirely, which is why the answer above
simplifies this spec rather than narrowing it.

---

## 1. What this replaces

The existing CSV layer is one row per shot, with session and series columns
repeated on every row (25 columns). That is why a session's structure has to be
reconstructed by grouping rows on import, and why a series with no shots is
awkward to represent.

The shape, already settled by the maintainer: **one self-contained JSON export**,
with Backup remaining the exact relational copy. A normalized, foreign-key JSON
export would duplicate `database.sqlite3` at lower fidelity.

**The Vault is never exported.** No opt-in here.

### 1.1 What is deleted, and what is emphatically not

Deleted — our own CSV export/import:

- `shared/src/csv/` (codec, types, export, import, plan, tests)
- `app/src/db/csv/` (`build-export.ts`, `apply-import.ts`, round-trip test)
- `app/src/features/csv/use-csv-export-import.ts`
- the CSV card in `app/src/app/(tabs)/settings.tsx`
- the `csv.*` i18n block (15 keys, both languages)
- the CSV branch of the Statistics report export (§1.3a)

**Not deleted — these are different CSVs and stay exactly as they are:**

- **ShotLog import** (`shared/src/shotlog/`, `app/src/features/shotlog/`,
  `app/src/db/queries/shotlog.ts`). This parses **ShotLog's own** export format,
  a third-party file we do not control. It has nothing to do with our export.
- **Webshooter import**, likewise a foreign format.

This distinction is the single most dangerous thing in this spec: a careless
"delete everything CSV" removes the ability to import from ShotLog, which is a
feature users depend on and cannot be recovered by re-exporting. It is called
out here so approval covers it explicitly, and it is asserted in §3.3.

### 1.2 What moves rather than dies

`shared/src/csv/plan.ts` (`ExistingIndex`, `PlanAction`, `DryRunPlan`,
`buildDryRunPlan`) is **not CSV-specific** — it is reconciliation between "what
the file contains" and "what the database already has". It moves to the JSON
module with its tests intact, and its behavior must not change (§3.3).

## 1.3 Revision 3 — two things implementation found that revision 2 missed

Recorded visibly rather than absorbed silently, per the spec's own rule.

**(a) The Statistics report also offered a CSV export.**
`app/src/features/export/use-report-export.ts` offers PDF / CSV / JSON for the
filtered report, and its CSV branch calls `exportSessionsToCsv` — the function
being deleted. §1.1 did not list it. Under "JSON only, no CSV" the CSV option
goes and the report keeps PDF and JSON. Added to §1.1's delete list and asserted
by criterion 23.

**(b) ShotLog's file picker was about to be broken.**
`pickCsvText` in `platform/csv-import.ts` was shared by our CSV import _and_
ShotLog import. Renaming it to a JSON picker would have left ShotLog offering
the user JSON files and rejecting their CSV — the exact §1.1 hazard, reached by
a different route than the one anticipated (a shared platform helper, not a
shared parser). `platform/import-file.ts` now exports **two** pickers,
`pickJsonText` and `pickCsvText`, and ShotLog keeps the CSV one.

**New criterion 23**: the Statistics report exports PDF and JSON, and no code
path references `exportSessionsToCsv`.

---

## 1.4 Revision 4 — firearms and licenses join the envelope (issue #314)

The format was narrower than the database: a session named its firearm as free
text and nothing carried a license at all, so no external source could bring
either in and a shooter recovering from a dead phone through the sessions
export lost their equipment.

The envelope gains two arrays, `firearms` and `licenses`, and a session gains
`firearmId` beside the existing `firearm` name. **`formatVersion` stays 1**
(maintainer, 2026-09-19; now CLAUDE.md hard rule 8): the fields are optional and
additive, every file in existence was written by this machine, and a version
gate would guard a case that cannot occur and then have to be carried forever.

- The name field stays because it is _useful_ — a session whose firearm the
  file does not carry still says what was shot with — not as a compatibility
  shim.
- A license names its firearm by `firearmId`; one naming a firearm the file
  does not carry is dropped on import, since `licenses.firearm_id` is a NOT
  NULL foreign key and a guessed target would be worse than no row.
- Firearms reconcile on id first, then on `"{make} {model}"` — the key the
  name-only path already used, so the two cannot produce two rows for one
  firearm. Round counters on a firearm that already exists here are left alone.
- Issue #312 (more than one caliber per firearm) is underneath this and
  unchanged by it: the envelope carries whatever the firearms table holds.

New criteria, each a named test: a firearm and its license round-trip whole
(added to P21); a file with neither array, and a session with no `firearmId`,
still import; one bad firearm or license is skipped on its own like a bad
session, reported as `invalid-firearm` / `invalid-license`.

---

## 1.5 Revision 5 — what the file is for, and the fields it was dropping (issue #756)

**What this file is for.** The sessions export is the _interchange_ format:
every session with its series, shots and stations, and the firearms and
licenses behind them, in a documented shape that something else can read and
that merges into an install that already has data. Everything else — settings,
photos, maintenance, the document vault — travels only in the backup bundle,
which is the exact copy of the database (`backup-export-spec.md`). A field
belongs here when losing it in export → wipe → import changes what a session
_is_ or makes a later import misbehave.

Three groups failed that test and were not carried:

- **`kind`** (`series` | `rounds`). Without it the import fell back to the
  column default, so a rounds-only session came back as a series session with
  `extraRounds` set and no series.
- **`tenCount`, `innerTenCount`.** A ShotLog session is one total-only series
  with no shot rows; these columns are its only record of its tens and inner
  tens.
- **`externalSource`, `externalRef`, `officialPlacement`,
  `officialStandardMedal`.** A WebShooter or ShotLog re-import matches on
  `externalRef`; without it, every session that came back through this file
  was imported a second time.

All seven are **additive and optional on read**: an absent `kind` reads as
`series`, the rest as `null`. **`formatVersion` stays 1** (CLAUDE.md hard rule
8). The import writes them on create and on update alike — an update replaces
the session with the file's copy, as it does every other field.

`webshooterCompetitionId` and `externalSyncedAt` stay out: the first is the
competition part of `externalRef`, the second is refresh bookkeeping for this
device.

New criteria, each a named test: every field round-trips with a non-default
value (`import.test.ts`, and P21 now generates all seven); a session written
without them imports as a `series` session with each one `null`; an out-of-range
value rejects only its session; and in the app, export → wipe → import writes
each column back as it was and leaves the refs where a WebShooter or ShotLog
import looks for them (`round-trip.test.ts`).

---

## 2. The file format

```json
{
  "format": "shotledger.sessions",
  "formatVersion": 1,
  "generatedAt": "2026-09-11T09:12:33.104Z",
  "app": { "name": "ShotLedger", "version": "1.0.0" },
  "sessions": [/* SessionExport objects */]
}
```

`format` and `formatVersion` are load-bearing: import refuses a file whose
`format` is not `shotledger.sessions`, and refuses a `formatVersion` greater than
it understands rather than guessing at unknown fields.

**Session shape**: exactly today's `SessionExport` / `SeriesExport` /
`ShotExport`, unchanged, nested — each session carries its series, each series
its shots. No new fields, no renames. The type moves out of `shared/src/csv/`
into the new module; the _data model_ does not change.

Two things this buys over CSV, both consequences of nesting rather than new
features: a **series with no shots** (a sighter, or a Webshooter total-override
series) is directly representable, and a **session with no series** needs no
placeholder row.

**Plain JSON only.** No comments, no JSONC, no JSON5, no new dependency. The
metadata header is real fields, so nothing depends on comments to be
machine-readable. If comments are wanted later they are an additive change to a
`formatVersion` — not a reason to add a parser now.

---

## 3. Acceptance criteria

Each becomes a named test.

### 3.1 Export

1. `exportSessionsToJson([])` → envelope with `sessions: []`, `format` and
   `formatVersion` present, and `JSON.parse` round-trips it.
2. A session with two series of five shots exports its exact structure.
3. A series with **zero shots** survives export.
4. A session with **no series** survives export.
5. `null`s stay `null` — `programId`, `competitionName`, `firearm`, `ammoLot`,
   `location`, `notes`, `extraRounds` — never `undefined`, never omitted, never
   the empty string.
6. `tags: []` stays an empty array, not `null`.
7. Unicode survives (`Träning`, `ä/å/ö`) unescaped-damaged.

### 3.2 Import

8. A file this app exported imports back to an identical `SessionExport[]`
   (also a property, §3.4).
9. `format` missing or wrong → named error, nothing imported.
10. `formatVersion` newer than supported → named error telling the user to
    update the app (mirrors `backup.restoreNewerSchema`).
11. Malformed JSON → named error, not a crash.
12. A structurally valid file with a bad session (shot value out of range,
    colliding series positions) rejects **that session** and still imports the
    rest, reporting which failed — the behavior CSV had per row.
13. Import writes in **one transaction**: a failure part-way leaves the database
    exactly as it was.

### 3.3 Invariants that must survive (negative constraints)

14. **ShotLog import still works.** Its tests pass unchanged and its files are
    untouched. This is the §1.1 hazard, asserted.
15. **Webshooter import still works**, likewise.
16. **The dry-run plan behaves identically** after moving: `buildDryRunPlan`'s
    existing tests move with it and pass unmodified — no assertion edited.
17. `SessionExport`, `SeriesExport`, `ShotExport` keep their current field names
    and types.
18. **No new runtime dependency.** The lockfile gains nothing.
19. The Vault is not exported by any path added here.
20. Backup/restore is untouched.

### 3.4 Properties (Tier 3)

21. **Round-trip identity**: for any generated `SessionExport[]`,
    `import(export(x))` deep-equals `x`. Generators cover empty sessions, empty
    series, unicode, every nullable field, and decimal vs integer scoring.
22. **Import is total**: for any string whatsoever, import returns a result or a
    named error — it never throws.

### 3.5 Failure model (Tier 3)

| Mode                                                       | Layer that catches it                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Deleting CSV takes ShotLog import with it                  | criteria 14–15, asserted by ShotLog's own suite passing unchanged             |
| Hostile/corrupt file crashes the app                       | property 22 + criteria 9–11                                                   |
| Partial import leaves half a session                       | criterion 13, with a test that forces a mid-file failure and asserts rollback |
| Silent data loss (a field dropped in the container change) | property 21, comparing whole objects rather than named fields                 |
| Import overwrites a session the user wanted kept           | criterion 16 + the dry run shown before any write                             |

---

## 4. Not in this spec

- **YAML**, **JSONC**, **JSON5**, comments, any parser dependency.
- **Scheduled backup and Google Drive** — deferred and dropped (#138 log).
- Any change to what a session contains.
- Any change to ShotLog or Webshooter import.

---

## 5. Setup plan (approving this spec authorizes this)

- **Isolation**: branch `feat/json-export` off current `main`. Not a worktree —
  the gauntlet needs `node_modules`, and a fresh worktree has none.
- **Git**: checkpoint commit at spec approval, then at each GREEN/REFACTOR, per
  the repo's existing branch-per-change + DCO convention.
- **New dependencies: none.**
- **Files added**: `shared/src/json-export/{types,export,import,plan,index}.ts`,
  one `*.test.ts` per module, and `round-trip.property.test.ts`.
  App layer: `app/src/db/json-export/{build-export,apply-import}.ts`,
  `app/src/features/json-export/use-json-export-import.ts`.
- **Files deleted**: as listed in §1.1.
- **i18n**: `csv.*` replaced by `jsonExport.*`; both languages stay key-identical.
- **Coverage/mutation**: `shared/src/json-export` joins the configs at the same
  100% threshold as `shared/src/scoring`.

---

## 6. Remaining assumption — say if this is wrong

**Importing a session id that already exists.** CSV's plan called that `update`
(overwrite in place). This spec keeps that, because the dry run shows it before
anything is written and it is the behavior the plan tests already encode.

The alternative — always import as a new session — would duplicate a session
whenever a file is imported twice, so it is not obviously safer.

---

## 7. Approval

**Not approved yet.** This is revision 2. If §6 is wrong, say so and it becomes
revision 3; otherwise an explicit approval of _this_ document starts
implementation.
