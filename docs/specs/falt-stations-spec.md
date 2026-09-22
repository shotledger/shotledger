# Fält stations: persistence and entry — executable spec

**Spec approval: obtained from the maintainer 2026-09-22**, on this revised
version (`falt_stations` as its own table). The first draft — six nullable
columns on `series` — was rejected; see §1. Append-only from here; a revision
is visible, never silent.

Issue: #315, PR 1 of 2 ("a fält session becomes recordable end to end").
Builds on #392, which landed `shared/src/scoring/falt.ts`, the `hits` scoring
model and the `spsf-falt` discipline.

Tier 3: a schema migration on a table that syncs, plus `shared/scoring/`.

## What this PR delivers

A fält session can be created, its stations entered, and its result read —
on the device, offline, in both languages. Nothing else consumes it yet.

## The maintainer's rulings this rests on

From #315 (2026-09-22). These are inputs, not inferences:

1. **Poängmål has no fixed ring scheme** — "Point can be 1-5, 1-10 etc." The
   shooter enters **points scored and max points, per station**; stations in
   one round may differ.
2. **A station is `hits/figures`** — "5/3 (4 figures) means that I had 5 hits
   in 3 figures". Both numbers are entered; neither is derived.
3. **Särskjutning is placement-only** — never in the recorded score.
4. **A station can be scratched** when it breaks SHB or SäkB. "Leave the entry
   but mark it as scratched and do not count in result or statistics."
5. **`OptR` is not a sanctioned vapengrupp.**

## Scope

### 1. Schema — a `falt_stations` table, migration `0004`

**Revised 2026-09-22 on the maintainer's objection.** The first draft put six
nullable columns on `series`. Rejected, and rightly: a station cannot use
`is_sighter` (fält has no provskott, D.6.6), cannot use `is_final` (there are
no finals in fält), and `is_total_override` and its two companions are ring
concepts. The overlap between a ring series and a station is three fields out
of ten, in both directions — so they are two things, not one thing with
optional parts.

`series` is **unchanged**. New table:

| Column | Type | Meaning |
| --- | --- | --- |
| `id`, `created_at`, `updated_at`, `deleted_at` | — | the `common` sync columns, as every other table |
| `session_id` | text, not null | → `sessions` |
| `position` | int, not null | 1-based station number |
| `hits` | int, not null | 0–6 |
| `figures_hit` | int, not null | 0–`hits` |
| `points` | int, null | Poängmål points scored; null = the station had none |
| `points_max` | int, null | What that poängmål could give (ruling 1) |
| `is_scratched` | int, not null, default 0 | Ruling 4 |
| `is_shoot_off` | int, not null, default 0 | Särskjutning station (ruling 3) |
| `photo_uri` | text, null | same shape as a series' photo |
| `note` | text, null | |

`hits` and `figures_hit` are NOT NULL here, where the first draft had them
nullable — in a table that exists only for stations, "no hits recorded" is 0,
not unknown.

On `sessions`, one column: `falt_result_mode` text null, `'falt' | 'poangfalt'`
— the mode belongs to the competition (#392 decision 2), and null on every
non-fält session.

**Sync**: `falt_stations` joins `SYNC_TABLE_NAMES`
(`shared/src/sync/protocol.ts`) and `APPLY_ORDER`
(`shared/src/sync-client/order.ts`, after `sessions`), and the migration
carries the same three outbox triggers every synced table has. The backend
needs **no change and no deploy** — `sync_rows` is generic over `table_name`,
and the payload is `z.unknown()`. `PROTOCOL_VERSION` stays 1 (hard rule 8).

English identifiers throughout (hard rule 9): `is_shoot_off`, not
`is_sarskjutning` — särskjutning is a descriptive term, and rule 9's carve-out
covers official discipline names and document field labels, not this. The
table name `falt_stations` and the enum values `'falt' | 'poangfalt'` are
stored ids and keep their spelling, as `shared/src/scoring/falt.ts` already
has them.

### 2. `shared/src/scoring/falt.ts` — which stations score

One addition, pure, no change to any existing export:

```ts
export interface FaltStationEntry extends FaltStation {
  isScratched: boolean;
  isShootOff: boolean;
}
export function scoringStations(
  stations: readonly FaltStationEntry[],
): readonly FaltStation[];
```

Everything already there (`faltResult`, `poangfaltPoints`,
`compareFaltResults`) consumes its output unchanged.

### 3. Queries — `app/src/db/queries/falt.ts`

`listStationsForSession`, `addStation`, `updateStation`, `deleteStation`,
`faltSessionResult` — the table's own CRUD, in the shape every other
`queries/*.ts` module has.

Two existing read paths must learn the second table, because a session that
fired 60 rounds may not report 0: `round-count.ts` (the firearm round counter)
and `ammo-usage.ts` count `SHOTS_PER_STATION` per non-scratched station. A
scratched station's shots were still fired, so they count for volume and not
for score — the same split `isSighter` already has (SCORE_003).

### 4. UI

- **`session/new.tsx`** stops filtering through `ringScoringDisciplines()`, so
  `spsf-falt` is offered. The filter **stays** in `shared/src/shotlog/tags.ts`
  and `dev/shotlog-import.tsx`: ShotLog's own data has no fält, so offering it
  there would be wrong, not incomplete.
- **A result-mode control** on the new-session form, fält only.
- **A station entry screen**, reached where a ring session reaches the keypad:
  hits (0–6), figures hit, optional poäng + max, a scratched toggle and a
  särskjutning toggle. The keypad is not reused — there is no per-shot value.
- **Session detail** shows a fält session as stations and a result
  ("26 träff i 22 figurer", or the poängfält sum), with scratched stations
  struck through and särskjutning stations after the round, both excluded from
  the total.

### 5. Docs, in the same PR

`docs/manual/guides/logging-a-session.md` + `.sv.md` gain a fält section;
`docs/manual/reference/glossary.md` + `.sv.md` gain station, poängmål,
särskjutning, omskjutning. `docs/implementation-plan.md` checkbox ticked.
One new reqstool requirement (`SCORE_005`, below) with its SVC, a
`@Requirements` tag on `scoringStations` and an `@SVCs` tag on its test.

## Acceptance criteria

Each maps to a test in EVIDENCE.

### `scoringStations` (shared/scoring)

- **S1** Plain stations pass through unchanged, in order.
- **S2** A scratched station is dropped.
- **S3** A särskjutning station is dropped.
- **S4** A station both scratched and särskjutning is dropped once (no
  duplication, no throw).
- **S5** A round of only scratched stations yields `[]`, and `faltResult([])`
  is `{stationCount: 0, hits: 0, figuresHit: 0, ringedFigurePoints: null}` —
  an all-scratched round is not an error.
- **S6** Dropping is positional-safe: the countback in `compareFaltResults`
  sees the surviving stations, so a scratched **last** station makes the
  station before it the countback's last.
- **S7** A scratched station's bad numbers never throw — validation runs on
  what scores, so 6 hits in 0 figures on a scratched station is droppable
  data, not a crash.

### Persistence

- **P1** Migration `0004` creates `falt_stations` with its outbox triggers and
  adds `sessions.falt_result_mode`; an existing database migrates with `series`
  byte-identical and every existing session reading `falt_result_mode = null`.
- **P2** A station round-trips: written values read back identically,
  including `points = null` distinct from `points = 0`.
- **P3** `faltSessionResult` on a session with a scratched and a särskjutning
  station returns the totals over the remaining stations only.
- **P4** An inserted, updated and soft-deleted station each reach
  `sync_outbox` — the new triggers, asserted, not assumed.
- **P5** `falt_stations` is in both `SYNC_TABLE_NAMES` and `APPLY_ORDER`, after
  `sessions` (the existing permutation test covers the first half of this).
- **P6** A fält session's stations add `6 × stations` to the firearm round
  counter and to ammo-lot usage, scratched stations included.
- **P7** Deleting a session removes its stations, exactly as it removes its
  series.

### Entry (UI, driven on the emulator)

- **U1** `spsf-falt` is offered in the new-session picker; a fält session is
  created with a result mode.
- **U2** Entering 5 hits in 3 figures on station 1 shows "5/3" in the session,
  and the session total reads 5 träff i 3 figurer.
- **U3** `hits` above 6, or `figuresHit` above `hits`, cannot be entered —
  the control does not offer it.
- **U4** Scratching a station strikes it through and removes it from the
  total, without deleting the numbers.
- **U5** Backing out of a new station without entering anything leaves no
  orphaned row (the bug fixed for ring series in `fix/session-detail-ui`).
- **U6** A ring session's flow is visually and behaviourally unchanged.

### Must NOT do (invariants)

- **N1** No existing test weakened, skipped or deleted.
- **N2** No change to `faltResult`, `poangfaltPoints`, `compareFaltResults`,
  `byFalt` — signatures and behaviour identical, proven by the existing suite.
- **N3** No sync protocol version change; `PROTOCOL_VERSION` stays 1.
- **N4** Statistics, personal bests, CSV/JSON export and the PDF log are
  untouched: they stay ring-only and must not start seeing hits sessions in
  this PR (that is PR 2). A fält session appearing in a statistic in this PR
  is a defect.
- **N5** No new dependency.
- **N6** ShotLog import and its tag vocabulary stay rings-only.
- **N7** `spsf-falt`'s vapengrupper stay A, A optisk, B, C, R — no `OptR`.
- **N8** `series` is untouched: no column added, removed or changed.

## Setup plan

- **Isolation: a branch**, `feat/falt-stations`, already cut from
  `origin/main`. Not a worktree: the gauntlet needs `node_modules` and the
  Metro/Android build state, which a fresh worktree does not have.
- **No new dependencies.** `drizzle-kit` (already present) generates the
  migration; `app/src/db/migrations/migrations.js` and the `meta/` snapshot
  are regenerated by it, not hand-written.
- Files added: `docs/specs/falt-stations-spec.md` (this file),
  `app/src/db/migrations/0004_falt_stations.sql`,
  `app/src/db/queries/falt.ts` + `.test.ts`,
  `app/src/app/session/[id]/station/[pos].tsx`,
  `docs/evidence/falt-stations-evidence.md`.
- Commits: DCO-signed, Conventional Commits, checkpoint per GREEN.
- The emulator is used for U1–U6 (one AVD, killed afterwards). No other heavy
  job runs alongside it.

## Gauntlet plan

`pnpm check`, `pnpm coverage` (100% on `shared/src/scoring`), `pnpm mutation`,
`pnpm mutation:schema`, the three docs gates, `pnpm reqstool:tags` +
`reqstool:status`, and the emulator run for U1–U6. Property-based round-trip
on `scoringStations` (order and membership preserved under arbitrary flag
combinations). Baseline recorded before the first edit.

## Out of scope

Statistics and personal bests, CSV/JSON export, the PDF log (all PR 2);
WebShooter fält import (#352, on top of this schema); magnumfält (Del E);
a poängmål ring scheme (there is none — ruling 1).

## Open questions that remain open

#315 questions 2, 3, 5, 6 and 8. None blocks anything in this PR.
