# Bound a fält station's point fields (#837, scoring part)

**Spec approved by the maintainer, 2026-10-14**, after implementation (the PR
opened as a draft): "1. ok", answering "Approve the spec for #854".

Tier 2 bug fix (old-coder). Isolation: its own branch and worktree,
`bugfix/837-bound-falt-and-shotlog-counts`. No new dependency, no schema
change, no sync protocol change.

## The bug

`shared/src/scoring/falt-station.ts`:

- `stationPoints` parses Points and Max Points with `/^\d+$/` and `Number()`.
  Any run of digits passes: `"1"` × 400 becomes `Infinity` (stored, then sent
  as `null` by `JSON.stringify`), 21 digits becomes `1e20`, which is not a
  safe integer. Since #697 the sync server refuses such a row.
- `stationProblem` checks `points` with `Number.isInteger`, which `1e20`
  passes, and never checks `pointsMax` on its own, only `points <= pointsMax`.

Writers that go through these two functions: the phone's station screen and
`addStation` (`app/src/db/queries/falt.ts`), the web's fält entry
(`web/src/entry/falt-model.ts`), `shared/src/sync-client/falt-entry.ts` and
`session-edit.ts`. Fixing the two functions fixes all of them.

## Behaviour

| Id  | Given                                                                                                                       | Then                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `stationPoints` with a digit run over `MAX_SAFE_INTEGER`                                                                    | `{ ok: false }`, for Points and for Max Points (`"1"` × 400, `"100000000000000000000"`)                                                                                                      |
| B2  | `stationPoints('9007199254740991', '')`                                                                                     | `{ ok: true, points: 9007199254740991, pointsMax: null }`: the largest safe integer still parses                                                                                             |
| B3  | `stationProblem` with `points: 1e20` or `Infinity`                                                                          | `station N: points must be a non-negative integer or null, got …`                                                                                                                            |
| B4  | `stationProblem` with `pointsMax` not a non-negative safe integer (`-1`, `1.5`, `1e20`, `Infinity`), with or without points | `station N: pointsMax must be a non-negative integer or null, got …`                                                                                                                         |
| B6  | `stationPoints` with `0x10`, `1e3`, `1E3`, `0b1`, `0o7` in either field                                                     | `{ ok: false }`: digits only. Already true before this change (the `^\d+$` test); pinned because Stryker showed nothing else would catch a looser pattern once the safe-integer check exists |
| B5  | A scratched station with any of the above                                                                                   | `null`, unchanged: a scratched station records what went wrong                                                                                                                               |

B4 changes one asserted behaviour: S1 in `falt-station.test.ts` pinned
`stationProblem(station({ pointsMax: -1 }))` to `null` ("a max is only checked
against points"). No writer stores a max without points (`stationPoints` drops
it), so the only rows B4 refuses are ones no screen can produce. That
assertion becomes B4's.

**Not changed:** no domain bound beyond a safe integer is added; SHB does not
give one for a poängmål's points, and inventing one would be guessing a
scoring value (CLAUDE.md rule 4). Hits, Figures Hit and Figures keep their
0–6 bounds.

**Not in this PR:** the ShotLog importer's counts (`parseCount` in
`shared/src/shotlog/parse.ts`, from the issue's comment). Those numbers are only
compared with the shots to raise a mismatch warning and are never stored, so a
huge one yields a warning, not a bad row.

## Gauntlet

`pnpm check` (100% coverage on `shared/src/scoring/*.ts`), `pnpm mutation`
scoped to `falt-station.ts`, and a RED run of each new test before the fix.
Evidence: `docs/specs/falt-station-bounds-evidence.md`.
