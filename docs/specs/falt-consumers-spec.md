# Fält consumers — spec

Status: **approved** — maintainer, 2026-10-03: "go on with layer a and b".
Layer B's §B.0 questions were not answered individually; the proposals stand
as written. Issue #315, "PR 2 — the
consumers". Builds on `falt-scoring-spec.md` (#392) and `falt-stations-spec.md`
(#402).

## Why

A fält session stores its result in `falt_stations`, not in `series`/`shots`.
Every consumer written before #402 reads only `series`/`shots`, so today a fält
session is silently dropped or zeroed by them. An audit of 2026-10-03 found,
most user-visible first:

1. **JSON export drops every station and `faltResultMode`**; import of that
   file restores an empty fält session and credits 0 rounds to the firearm.
2. **Sessions list shows "0p"** for a fält session — Home was fixed in #402,
   the list was not (`session-list-row.ts`).
3. **PDF log total shots** omits station rounds — the licence-evidence
   document (COMPL_001) under-reports volume.
4. **Volume disagrees across screens**: the firearm counter and ammo usage
   count 6 rounds per station; Home "shots logged" and the stats report's
   Total shots count 0 (SCORE_003).
5. **Statistics** count a fält session as a session but show none of its
   result; a fält-only user sees an empty Stats tab; `spsf-falt` is not a
   selectable discipline; a series-length filter lets fält sessions through.
6. **No personal bests** for fält anywhere.
7. **Backup bundle** never bundles a station's photo and its manifest has no
   station count.
8. Stale `shared/src/csv/` references in three comments (CSV was replaced by
   JSON in #170 — there is no CSV consumer to build).
9. `falt-stations-spec.md` §3 says "per non-scratched station" while P6 and
   the code count scratched stations too. The code is right (a scratched
   station's rounds were fired); the sentence is fixed.

## Shape: two stacked PRs

- **Layer A — integrity and volume** (items 1–4, 8–9; item 7 dropped, see Backup bundle). No product decision
  open; fully specified below.
- **Layer B — statistics and PBs** (items 5–6). Needs the decisions in §B.0
  before it is specified to scenario level.

## Volume rule (applies everywhere in both layers)

A fält station is **6 rounds fired** (`SHOTS_PER_STATION`, D.6.4), scratched
and särskjutning stations included — the existing `round-count.ts` /
`ammo-usage.ts` rule. Volume never reads hits. Score never reads a scratched
or särskjutning station (`scoringStations`, SCORE_005).

## Layer A — scenarios

### JSON export / import (`shared/src/json-export`, `app/src/db/json-export`)

Session schema gains, **required** (hard rule 8 — no default, no
read-both-shapes; a pre-change export file is rejected by the schema, which
is acceptable while the maintainer is the only user and the phone is backed up
by the sqlite bundle):

- `faltResultMode: 'falt' | 'poangfalt' | null`
- `stations: Station[]`, where `Station` = `{ position, hits, figuresHit,
  points: int|null, pointsMax: int|null, isScratched, isShootOff, note:
  string|null }`. `photoUri` is not exported (a series' isn't either).

- **J1** Export of a fält session with 3 stations (one scratched, one
  särskjutning, one with poäng 8/10) carries all three with every field, in
  position order, and `faltResultMode`.
- **J2** Export of a ring session carries `stations: []` and
  `faltResultMode: null`.
- **J3** Importing J1's file into an empty DB recreates the session with the
  three stations field-for-field and `faltResultMode`.
- **J4** Import credits the linked firearm `6 × stations` rounds (3 → 18),
  scratched and särskjutning included, on top of shots + extraRounds.
- **J5** Re-importing over the same session tombstones its existing stations
  before inserting the file's (no duplicates), and the firearm counter moves by
  the difference only (before-count includes `6 × live stations`).
- **J6** Schema rejects a station with hits 7, figuresHit > hits, a negative
  value, or position 0 — the same bounds as the DB entry path.
- **J7** Property: `export → import → export` is identity for sessions with
  arbitrary valid stations (extends `round-trip.property.test.ts`).
- **J8** `buildAnalyticsReportJson` `shotsFired` includes station rounds.
- **J9** (added during implementation) The import preview's per-session
  shot count includes `6 × stations` — otherwise a fält session previews as
  "0 shots", the number the user checks to see they picked the right file.

### Sessions list

- **L1** A fält session row shows its result exactly as Home does
  (`buildHomeSessionRow` given the fält result), never "0p".

### Volume

- **V1** Home "shots logged" = shots + extraRounds + `6 × live stations`.
- **V2** PDF log totals line includes `6 × stations` per fält session in the
  printed period.
- **V3** Stats report Total shots includes station rounds of the fält
  sessions in the report's session set.

### Backup bundle — dropped during implementation (spec revision, 2026-10-03)

- ~~**B1** A station's `photo_uri` is bundled and rewritten like a series'.~~
  Nothing writes a station photo: the column exists, but no screen or import
  sets it. Bundling it is code for a case that cannot occur; it belongs with
  whatever change adds a station photo.
- ~~**B2** The manifest counts stations.~~ A required count would make every
  existing backup fail manifest validation on restore; an optional one is the
  read-both-shapes path hard rule 8 rules out. The count is display-only, and
  the stations themselves are in the bundled database either way.

### Housekeeping

- **H1** The three stale CSV comments point at what exists, or are deleted.
- **H2** `falt-stations-spec.md` §3's sentence matches P6.

### Invariants (must NOT change)

- **N1** Ring-session export, import and their existing tests unchanged apart
  from the two added fields.
- **N2** No consumer scores a scratched or särskjutning station.
- **N3** Firearm counter and ammo usage numbers unchanged (already correct).
- **N4** No statistic shows a fält *result* in Layer A — that is Layer B.
- **N5** No new dependency. No DB schema change (stations already exist).

### reqstool

New **EXPORT_00x** "A JSON export round-trips a fält session's stations" with
SVC on J3/J7; SCORE_003's SVC gains V1–V3 as verification of the volume rule.

## Layer B — statistics and PBs (to specify after §B.0)

### B.0 Decisions needed from the maintainer

1. **What a fält statistic is.** Proposal: when `spsf-falt` is the selected
   discipline, the report shows sessions, stations, **hit rate** (hits /
   6·stations), figures hit (see 2), and a hits-per-station trend chart; the ring cards (mean, SD,
   10-count) are not shown.
2. **Figure rate needs a denominator the app does not store** — the station's
   figure count ("5/3 (4 figures)" — the "4" is not a column). Either record
   `figuresTotal` per station (schema change + entry field), or show figures
   hit as a raw count only. Recommendation: raw count only, no schema change.
3. **Personal best key.** Proposal: best `faltResult` by
   `compareFaltResults`, keyed on (vapengrupp, **count of scoring stations**),
   so a 10-station championship with two scratched compares with an
   8-station kretsfält. Poängfält sessions ranked separately (different sum).
4. **Mixed reports.** A report with "all disciplines" selected: fält sessions
   contribute to session count and volume only, never to ring means — the
   current behaviour, now explicit. A series-length filter excludes fält.

## Setup plan

- Isolation: this branch (`jimisola/feat-disciplines-support-f-ltskjutning-hit-miss`)
  in its own worktree — already isolated from the main checkout.
- Layer A on this branch; Layer B on a branch stacked on it (`gh stack`).
- Checkpoint commits at spec approval and per GREEN, DCO-signed.
- Gauntlet: `pnpm check`, `pnpm coverage`, Stryker on the changed
  `shared/src/json-export` files, the docs gates and `reqstool:status`, one
  emulator run (export → wipe → import a fält session; Sessions list row).
- Manual: `docs/manual/` export/import page and its `.sv.md`, same PR.
- Files added: this spec, `falt-consumers-evidence.md`, tests next to each
  changed module. No new dependencies.
