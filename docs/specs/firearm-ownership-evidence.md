# Firearm ownership and the derived FAP 551-3 case — evidence report

Spec: [`firearm-ownership-spec.md`](firearm-ownership-spec.md). Issue #286.
Old-coder Tier 2.

**Spec approval: not obtained (autonomous run).** The correlation-breaking
review the loop relies on did not happen before the code was written; the spec
is the artifact to review after the fact, and the confidence claimed here is
correspondingly lower.

- Source state: branch `feat/firearm-own-flag`, commit
  `c80dc85798add0d23b7efe4a44f3a68897c0e9c6`, worktree
  `/home/jimisola/tmp/shotledger-wt-ownflag` off `origin/main` at `b4331b1`.
- Toolchain: node v24.12.0, tsc 7.0.2, vitest 5.0.0, jest 30.5.1 (app),
  Stryker per `stryker.config.json`, prettier 3.9.6, eslint 10.10.0.
- Every number below is from one fresh run after the last code edit.
- Entry point: `pnpm gauntlet` runs every layer; the individual commands are
  quoted per layer.

## Behaviors → tests

| Spec  | Test                                                                                       |
| ----- | ------------------------------------------------------------------------------------------ |
| D1    | `deriveSeVariantId > D1: no firearms at all is the 5 § case`                               |
| D2    | `… > D2: an owned pistol is the 6 § case`                                                  |
| D3    | `… > D3: an owned revolver is the 6 § case`                                                |
| D4    | `… > D4: an owned rifle is not an enhandsvapen`                                            |
| D5    | `… > D5: an owned airgun does not count — the app cannot tell a licensed one apart`        |
| D6    | `… > D6: a borrowed pistol is not held by the shooter`                                     |
| D7    | `… > D7: a pistol whose ownership is not stated keeps the stricter case`                   |
| D8    | `… > D8: an owned firearm with no weapon type recorded keeps the stricter case`            |
| D9    | `… > D9: one owned handgun among borrowed and non-handgun firearms is enough`              |
| D10   | `… > D10: no owned handgun among them stays the 5 § case`                                  |
| V1    | `resolveDefaultVariantId > V1: none has no default case at all`                            |
| V2    | `… > V2: se with no firearms defaults to the stricter 5 § case`                            |
| V3    | `… > V3: se with an owned handgun defaults to the 6 § case`                                |
| V4    | `… > V4: omitting the facts entirely is not "owns a handgun"`                              |
| V5    | `… > V5: a profile that declares no derivation falls back to its defaultVariantId`         |
| V6    | `… > V6: the derived case feeds getProfile and lands on the 6 § numbers`                   |
| V7    | `… > V7: an explicit variant id is unaffected by the facts — getProfile never sees them`   |
| C1–C5 | `resolveComplianceCase > C1…C5` (`app/src/features/compliance/resolve-case.test.ts`, jest) |
| Q1    | `isOwn (FAP 551-3 input, issue #286) > Q1: is null until the shooter states it`            |
| Q2    | `… > Q2: round-trips true and false`                                                       |
| Q3    | `… > Q3: updateFirearm persists it without touching the other columns`                     |
| Q4    | `listFirearmOwnershipFacts > Q4: one weapon-type/ownership pair per firearm`               |
| Q5    | `… > Q5: a soft-deleted firearm is not a fact about the shooter any more`                  |

**Spec revision during implementation**, recorded in the spec itself: C5's
expectation changed from "an unknown stored id resolves to the profile's
declared default" to "…falls through to the derivation". The first was written
before it was clear that `getProfile`'s unknown-id fallback and "the default"
had stopped being the same thing. The assertion was changed first, watched
fail, then the implementation changed — never both in one step.

Every behavior was watched RED before it was made GREEN: D1–D10 + the
handgun-type loop failed 11/11 against the missing export; V1–V6 failed 6/7
(V7 passed immediately — it re-asserts the pre-existing `getProfile` contract
already covered by P5/P7, kept here as regression armor for N5, not claimed as
new verification); C1–C5 failed 5/5 against a stub that throws; Q1–Q5 failed
5/5 against the missing column.

## Negative constraints

| #   | How verified                                                                                                 | Result                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| N1  | `grep -rn "from '@/\|app/src" shared/src/compliance/`                                                        | 0 hits                                                                                                                       |
| N2  | `git diff --stat origin/main -- shared/src/compliance/`                                                      | `licence-activity.ts`, `months.ts`, `indicators.ts`, `constants-se.ts` all absent from the diff — no regulatory number moved |
| N3  | test `N3: adds firearms.is_own without inventing a value for existing rows`, plus a negative control (below) | green                                                                                                                        |
| N4  | `grep -rn "complianceProfileVariant\|setVariantId" app/src`                                                  | one writer, `setVariantId` in the hook, one call site: the Settings picker's `onChange`                                      |
| N5  | C4, V7                                                                                                       | green                                                                                                                        |
| N6  | full suites                                                                                                  | green (below)                                                                                                                |

**Negative control for N3** (the one assertion written specifically for this
change's risk): the migration SQL was temporarily changed to
`ALTER TABLE firearms ADD is_own integer DEFAULT 1` — the exact defect the
constraint exists to forbid — and the test went red
(`N3: … × 1 failed | 7 passed`); restoring the file returned `8 passed`. What
this buys: the test reaches its failure path for a backfilling migration. It
does not prove it would catch every way a value could be invented for an
existing row.

## Gauntlet

| Layer                                                    | Command                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format, schema, i18n, licenses, unit suites | `pnpm check`                              | green — export-schema matches; `en.json: 1053 keys, sv.json: 1053 keys, 0 issues`; `licenses-check: 100 packages, invariants hold`; prettier "All matched files use Prettier code style!"; vitest `132 files / 2148 tests passed`; app jest `38 suites / 370 tests passed`                                                                                                                                                                |
| Coverage (fails nonzero under threshold)                 | `pnpm coverage`                           | Statements 100% (2567/2567), Branches 100% (1489/1489), Functions 100% (590/590), Lines 100% (2211/2211)                                                                                                                                                                                                                                                                                                                                  |
| Mutation                                                 | `pnpm mutation`                           | `Final mutation score of 96.02 is greater than or equal to break threshold 95`; `shared/src/compliance` 94.58%, `profiles/se.ts` 92.31%, `profile-registry.ts` 92.00%                                                                                                                                                                                                                                                                     |
| Docs build                                               | `mkdocs build --strict`                   | `Documentation built in 0.65 seconds`, no warnings                                                                                                                                                                                                                                                                                                                                                                                        |
| Docs translation                                         | `node scripts/docs-translation-check.mjs` | `16 translated page(s) current, 0 not translated yet`                                                                                                                                                                                                                                                                                                                                                                                     |
| Property-based tests                                     | —                                         | **skipped.** The derivation is a boolean over a three-valued field and a two-element type list; the D-table enumerates its whole input space, so a generator would restate it                                                                                                                                                                                                                                                             |
| Real execution                                           | Expo web preview                          | **attempted, blocked.** `expo start --web` bundled and ran (`Web Bundled 2328ms … 2241 modules`), but the renderer froze at the first screenshot — synchronous `expo-sqlite` on a web page that is not cross-origin isolated (ADR 0012's known limitation; the Metro dev server cannot send COOP/COEP). No emulator and no Gradle: the machine is shared and the task brief forbids both. **The UI has therefore not been seen running.** |
| Supply chain                                             | —                                         | no dependency changed; `pnpm licenses:check` green                                                                                                                                                                                                                                                                                                                                                                                        |
| Suite health                                             | —                                         | **not run.** No randomized-order run; the suites here are deterministic unit tests with no shared state, but that is an argument, not a measurement                                                                                                                                                                                                                                                                                       |

### Mutation survivors in the changed code (2, both classified equivalent)

```
shared/src/compliance/profiles/se.ts:40:7   ConditionalExpression
-   fact.weaponType !== null &&
+   true &&
```

Equivalent. `SE_HANDGUN_WEAPON_TYPES.includes(null)` is `false` regardless, so
the guard changes no outcome; it is there because `Array<string>.includes`
does not accept `string | null`. Killing it would need an input where a null
weapon type is a handgun, which cannot exist.

```
shared/src/compliance/profile-registry.ts:78:44   ArrayDeclaration
-   facts: readonly FirearmOwnershipFact[] = [],
+   facts: readonly FirearmOwnershipFact[] = ["Stryker was here"],
```

Equivalent in observable behaviour. Any default whose elements are not facts
with `isOwn === true` and a handgun type derives the same `firstHandgun`, so
no test can separate the mutant from the original through the public API. The
default itself is asserted by V4.

`profile-registry.ts:42:37` also survives; it is pre-existing `getProfile`
code untouched by this change, and was already classified equivalent in
`compliance-fap551-evidence.md` (there at line 41:37).

## Environment differences

The gauntlet ran in the worktree, which differs from the landing tree only by
gitignored install output (`node_modules`, `shared/dist`), installed from the
repo's own lockfile. No `.env` or build artifact is involved in any layer.

## Known limits

- **The UI was never seen running** (row above). What is verified about the
  screens is types, lint and the pure functions behind them.
- The "airgun is not an enhandsvapen here" choice is an app-level conservative
  call, not a regulatory fact. It can only ever keep a shooter on the stricter
  case, and it is stated in the user manual.
- Migration `0002` skips `0001`, which belongs to the open PR #296. The journal
  tolerates the gap, but `meta/0002_snapshot.json` records `prevId` of the
  `0000` snapshot: once #296 lands, regenerate the snapshot on rebase so a
  future `drizzle-kit generate` diffs against the right ancestor.
