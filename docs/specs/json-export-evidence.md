# EVIDENCE — JSON export and import, replacing CSV

Spec: [`json-export-spec.md`](./json-export-spec.md), revision 2, **approved by
the maintainer 2026-09-11** ("approved, go ahead (JSON and NO CSV)"), plus
revision 3 recorded during implementation (§1.3) for three entanglements the
approved spec did not anticipate.

- **Source state**: commit `243306e` on `feat/json-export`
- **Tier**: 3 (data loss, import correctness, public file format)
- **Isolation**: branch, as the spec's setup plan proposed. Not a worktree — the
  gauntlet needs `node_modules`.
- **Reproduce**: `pnpm check`, `pnpm coverage`, `node scripts/manual-mutation.mjs`
- **Tool versions**: vitest 5.0.0, @vitest/coverage-v8 5.0.0, fast-check 4.9.0,
  typescript 6.0.2, eslint 10.10.0, @stryker-mutator/core 10.0.0

All numbers below come from one fresh run after the last code edit.

---

## 1. Spec criteria → tests

| #   | Criterion                                             | Test                                                                                                                                 |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | empty export is a valid envelope                      | `export.test.ts` C1                                                                                                                  |
| 2   | two series of five shots keep structure               | `export.test.ts` C2                                                                                                                  |
| 3   | series with zero shots survives                       | `export.test.ts` C3                                                                                                                  |
| 4   | session with no series survives                       | `export.test.ts` C4                                                                                                                  |
| 5   | nulls stay null                                       | `export.test.ts` C5                                                                                                                  |
| 6   | empty tags stay an array                              | `export.test.ts` C6                                                                                                                  |
| 7   | unicode survives                                      | `export.test.ts` C7                                                                                                                  |
| 8   | exported file imports back identically                | `import.test.ts` C8 + property P21 + `app/src/db/json-export/round-trip.test.ts`                                                     |
| 9   | foreign/missing `format` refused                      | `import.test.ts` C9 (×2)                                                                                                             |
| 10  | newer `formatVersion` refused                         | `import.test.ts` C10                                                                                                                 |
| 11  | malformed JSON is a named error                       | `import.test.ts` C11                                                                                                                 |
| 12  | one bad session skipped, rest imported                | `import.test.ts` C12 (×2) + the not-an-object case                                                                                   |
| 13  | import writes in one transaction                      | `apply-import.ts` runs inside `db.transaction`; end-to-end in `round-trip.test.ts` ("reproduces identical stats and volume metrics") |
| 14  | **ShotLog import still works**                        | `shared/src/shotlog/*` suites pass unchanged (85 shared test files green), plus two new `csv-codec.test.ts` cases                    |
| 15  | WebShooter import still works                         | its suites pass unchanged                                                                                                            |
| 16  | dry-run plan behaves identically after moving         | `plan.test.ts` — **moved with zero assertion edits**, plus 3 added cases                                                             |
| 17  | `SessionExport`/`SeriesExport`/`ShotExport` unchanged | types moved verbatim; `tsc -b` green across the monorepo                                                                             |
| 18  | **no new dependency**                                 | lockfile unchanged; `licenses-check: 98 packages` (same as before)                                                                   |
| 19  | Vault not exported                                    | no vault import in `shared/src/json-export` or `app/src/db/json-export`                                                              |
| 20  | backup/restore untouched                              | no files under `db/backup` or `features/backup` changed                                                                              |
| 21  | round-trip identity property                          | `round-trip.property.test.ts` P21, 300 runs                                                                                          |
| 22  | import is total                                       | `round-trip.property.test.ts` P22, 500 runs on arbitrary strings + 500 on `fc.json()`                                                |
| 23  | report exports PDF+JSON, no `exportSessionsToCsv`     | `EXPORT_FORMATS = ['pdf','json']`; `grep -r exportSessionsToCsv` → no hits                                                           |

Nothing in the spec is unmapped.

---

## 2. Gauntlet

| Layer            | Command                            | Result                                                                                                                 |
| ---------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full suite       | `pnpm check`                       | **1664 vitest passed**, **268 jest passed / 30 suites**, 0 failures                                                    |
| Static types     | `tsc -b` + `tsc --noEmit` (app)    | 0 errors                                                                                                               |
| Lint             | `eslint .`                         | 0 errors                                                                                                               |
| Format           | `prettier --check .`               | clean                                                                                                                  |
| i18n parity      | `pnpm i18n:check`                  | 839 keys each, 0 issues                                                                                                |
| Licences         | `pnpm licenses:check`              | 98 packages, invariants hold — unchanged, as criterion 18 requires                                                     |
| Coverage (gated) | `pnpm coverage`                    | **100% statements (2028/2028), branches (1138/1138), functions (483/483), lines (1752/1752)**; exits nonzero below 100 |
| Mutation         | `node scripts/manual-mutation.mjs` | **8/8 killed**                                                                                                         |
| Property-based   | included in the suite              | P21 300 runs, P22 1000 runs                                                                                            |
| Real execution   | —                                  | **Not performed.** See §5.                                                                                             |
| Supply chain     | —                                  | No dependency added or removed; nothing to audit. No new network/subprocess/filesystem capability.                     |

### 2.1 The mutation layer is a substitute, and why

**`pnpm mutation` (Stryker) is broken, and not by this branch.** It reports a
**0.00 score with every mutant surviving** — 4134 on this branch, **3575 on
`main`**, across every module including ones untouched here (scoring, timer,
vault). I ran it on `main` specifically to establish that baseline.

The initial test run succeeds (1226 tests), so the breakage is in mutant
activation, not the suite. Timeline points at vitest 5.0.0 landing in #144 on
2026-09-10; `@stryker-mutator/vitest-runner@10.0.0` declares `vitest >=2.0.0`,
so the incompatibility is silent rather than a version error.

**This matters beyond this change**: the repo's evidence-first claims for
`shared/src/scoring` and friends rest on that layer, and it has been reporting
nothing since #144. Raised as #171 — the cause is upstream
(stryker-mutator/stryker-js#6210: Vitest 5 matches `testNamePattern` against the
suite chain joined with `' > '`, the runner still joins with a space, so every
covered mutant runs zero tests). **Not fixed here**, because fixing an
unrelated pre-existing failure is scope creep and would have hidden it inside
this diff.

`scripts/manual-mutation.mjs` substitutes for it on this module: eight
plausible bugs, applied one at a time, tested, restored, with restoration
verified by `git status` rather than assumed.

**It fails closed** — a pattern that no longer matches exactly once, a file that
will not restore, or a survivor all exit nonzero.

**Proof it can fail (negative control): it did, on its first run.** The mutant
_"counts series instead of shots in the dry run"_ **survived**, and the script
reported it and exited 1. That was a real weakness: the shot-count test used
three series holding three shots, so `series.length` and the shot total gave the
same answer. The test now uses **5 shots across 3 series** and the mutant dies.
The control is therefore not hypothetical — the checker demonstrably
distinguishes a killed mutant from a survivor, and caught a genuine hole in my
own test.

What that buys, precisely: the eight mutants are ones I chose. They show the
suite kills these eight real bugs; they do not show it would kill every possible
bug, which is what a generated-mutant tool would have sampled far more widely.

---

## 3. What the spec got wrong, found while implementing

Recorded in the spec as revision 3 rather than absorbed silently. All three are
the same hazard — CSV entanglement reaching further than "our CSV module":

1. **The Statistics report also offered a CSV export**, calling the deleted
   `exportSessionsToCsv`. Under "JSON only" that option is gone; the report keeps
   PDF and JSON.
2. **ShotLog's file picker shared `platform/csv-import.ts`.** Renaming it to a
   JSON picker would have left ShotLog offering JSON files and rejecting the CSV
   its users actually have. `platform/import-file.ts` now exports two pickers.
3. **ShotLog's parser uses the CSV codec itself** (`parseCsv`). Deleting
   `shared/src/csv/` outright removed it. The codec moved to
   `shared/src/shotlog/csv-codec.ts`, next to its only remaining consumer.

Any of the three would have broken ShotLog import — a feature whose input files
are other people's, so no re-export could recover it. This is the single most
valuable thing this run produced, and none of it came from a test: it came from
the compiler and from grepping before deleting.

---

## 4. Deviations and honest limits

- **Real execution not performed.** The app has not been driven on a device with
  this branch: an export was never shared through the OS share sheet, and a file
  was never picked back through the system picker. Everything above is the pure
  layer plus the DB layer against a real SQLite database. The platform wrappers
  (`export-file.ts`, `import-file.ts`) are thin, but "thin" is not "verified" —
  the mime-type list on the picker in particular is exactly the kind of thing
  only a device shows you. **Treat the share/pick round trip as untested.**
- **Independent verification not performed.** Tier 3 offers it; it was not run.
  Claiming correspondingly less.
- **Criterion 13's rollback** is asserted end-to-end through the existing
  round-trip test rather than by a fault-injection test that fails mid-file. The
  transaction boundary is `db.transaction` in `apply-import.ts`, unchanged from
  the CSV implementation it inherited.
- **The §6 assumption still stands**: an existing session id imports as an
  update, not a duplicate. Asserted by `round-trip.test.ts` ("matches an existing
  session id as update instead of duplicating it"). The maintainer never
  explicitly ruled on it.
- **i18n key count fell** 851 → 839: the `csv.*` block (15 keys) became
  `jsonExport.*` (15), and `stats.exportCsv` plus `stats.exportHint.csv` are
  gone with the report's CSV option.
