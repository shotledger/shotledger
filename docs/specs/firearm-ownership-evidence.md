# Firearm ownership and the derived FAP 551-3 case — evidence report

Spec: [`firearm-ownership-spec.md`](firearm-ownership-spec.md). Issue #286.
Old-coder Tier 2.

**Second round, 2026-09-18.** The maintainer ruled that ownership is a plain
boolean defaulting to true and that the "Not Specified" state goes away. The
spec was revised to match (its "Why the column is nullable" section is
replaced, not merely overruled), the tests were revised, watched RED against
the previous implementation, and made GREEN. Every number below is from a
fresh run after that change.

**Spec approval: not obtained (autonomous run).** The correlation-breaking
review the loop relies on did not happen before the code was written; the spec
is the artifact to review after the fact, and the confidence claimed here is
correspondingly lower. The maintainer's decision above is an _input_ to the
revised spec, not approval of it.

- Source state: branch `feat/firearm-own-flag`, commit `363d1fa`,
  worktree `/home/jimisola/tmp/shotledger-wt-ownflag`, rebased onto `origin/main`
  at `75e02d1`. #296 had not landed, so no migration-chain fix-up was due.
- Toolchain: node v24.12.0, tsc 7.0.2, vitest 5.0.0, jest 30.5.1 (app),
  Stryker per `stryker.config.json`, prettier 3.9.6, eslint 10.10.0.
- Every number below is from one fresh run after the last code edit, against
  a clean working tree. **The first run of these layers was not**: it was green
  at `c80dc85` against a working tree holding two prettier reformats that had
  never been staged, and CI's `prettier --check` failed on the commit while the
  local one passed on the tree. `git status` is part of the layer now — a
  number measured on a tree that differs from the commit is not a number about
  the commit. The layers were rerun in full after `c149520` staged them.
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
| D7    | `… > D7: an owned firearm with no weapon type recorded keeps the stricter case`            |
| D8    | `… > D8: one owned handgun among borrowed and non-handgun firearms is enough`              |
| D9    | `… > D9: no owned handgun among them stays the 5 § case`                                   |
| V1    | `resolveDefaultVariantId > V1: none has no default case at all`                            |
| V2    | `… > V2: se with no firearms defaults to the stricter 5 § case`                            |
| V3    | `… > V3: se with an owned handgun defaults to the 6 § case`                                |
| V4    | `… > V4: omitting the facts entirely is not "owns a handgun"`                              |
| V5    | `… > V5: a profile that declares no derivation falls back to its defaultVariantId`         |
| V6    | `… > V6: the derived case feeds getProfile and lands on the 6 § numbers`                   |
| V7    | `… > V7: an explicit variant id is unaffected by the facts — getProfile never sees them`   |
| C1–C5 | `resolveComplianceCase > C1…C5` (`app/src/features/compliance/resolve-case.test.ts`, jest) |
| Q1    | `isOwn (FAP 551-3 input, issue #286) > Q1: defaults to own when the caller states nothing` |
| Q2    | `… > Q2: round-trips true and false`                                                       |
| Q3    | `… > Q3: updateFirearm persists it without touching the other columns`                     |
| Q4    | `listFirearmOwnershipFacts > Q4: one weapon-type/ownership pair per firearm`               |
| Q5    | `… > Q5: a soft-deleted firearm is not a fact about the shooter any more`                  |

**Spec revision, round two** (maintainer's decision, above), recorded in the
spec itself: the tri-state became a plain boolean defaulting to true. The
tests changed first — Q1 (`null` ⇒ `true`), Q4's unstated row, N3 (no backfill
⇒ backfill), plus the new N3b — and were watched RED against the unchanged
implementation (`4 failed | 13 passed`, verbatim below) before any source file
moved. Old D7 (`isOwn: null` keeps the stricter case) was **deleted**, not
weakened: the state it asserted no longer exists, so D7–D10 renumbered to
D7–D9. Net suite size is unchanged (2148), D7's removal offsetting N3b.

```
× N3: adds firearms.is_own and backfills every existing row to own
    AssertionError: expected { is_own: null } to deeply equal { is_own: 1 }
× N3b: a row inserted without is_own after the migration is own too
    AssertionError: expected { is_own: null } to deeply equal { is_own: 1 }
× Q1: defaults to own when the caller states nothing
    AssertionError: expected null to be true
× Q4: one weapon-type/ownership pair per firearm
    AssertionError: expected [ Array(3) ] to deeply equal ArrayContaining{…}
```

The D-table did **not** go RED, and is not claimed to have: `deriveSeVariantId`
behaves identically on `isOwn: true` / `false`, and the change to it is a type
narrowing plus the removal of an input that can no longer occur. What verifies
that narrowing is `tsc` (`pnpm typecheck`), not a test.

**Round one's spec revision**, retained for the record: C5's
expectation changed from "an unknown stored id resolves to the profile's
declared default" to "…falls through to the derivation". The first was written
before it was clear that `getProfile`'s unknown-id fallback and "the default"
had stopped being the same thing. The assertion was changed first, watched
fail, then the implementation changed — never both in one step.

Round one, for the record — every behavior was watched RED before it was made
GREEN: D1–D10 (as then numbered) + the
handgun-type loop failed 11/11 against the missing export; V1–V6 failed 6/7
(V7 passed immediately — it re-asserts the pre-existing `getProfile` contract
already covered by P5/P7, kept here as regression armor for N5, not claimed as
new verification); C1–C5 failed 5/5 against a stub that throws; Q1–Q5 failed
5/5 against the missing column.

## Negative constraints

| #   | How verified                                                                                                        | Result                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| N1  | `grep -rn "from '@/\|app/src" shared/src/compliance/`                                                               | 0 hits                                                                                                                       |
| N2  | `git diff --stat origin/main -- shared/src/compliance/`                                                             | `license-activity.ts`, `months.ts`, `indicators.ts`, `constants-se.ts` all absent from the diff — no regulatory number moved |
| N3  | tests `N3: adds firearms.is_own and backfills every existing row to own` and `N3b`, plus a negative control (below) | green                                                                                                                        |
| N4  | `grep -rn "complianceProfileVariant\|setVariantId" app/src`                                                         | one writer, `setVariantId` in the hook, one call site: the Settings picker's `onChange`                                      |
| N5  | C4, V7                                                                                                              | green                                                                                                                        |
| N6  | full suites                                                                                                         | green (below)                                                                                                                |

**Negative control for N3** (rerun for the inverted constraint): the migration
SQL was temporarily reverted to `ALTER TABLE firearms ADD is_own integer` —
the round-one form, which is now the defect — and both assertions went red
(`2 failed | 7 passed`); restoring the file returned `9 passed`. What this
buys: the tests reach their failure path for a migration that adds the column
without backfilling. It does not prove they would catch every way a row could
end up without the value.

## Gauntlet

| Layer                                                    | Command                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format, schema, i18n, licenses, unit suites | `pnpm check`                              | green — export-schema matches; `en.json: 1052 keys, sv.json: 1052 keys, 0 issues`; `licenses-check: 100 packages, invariants hold`; prettier "All matched files use Prettier code style!"; vitest `132 files / 2148 tests passed`; app jest `38 suites / 370 tests passed`                                                                                                                                                                |
| Coverage (fails nonzero under threshold)                 | `pnpm coverage`                           | Statements 100% (2567/2567), Branches 100% (1489/1489), Functions 100% (590/590), Lines 100% (2211/2211)                                                                                                                                                                                                                                                                                                                                  |
| Mutation                                                 | `pnpm mutation`                           | `Final mutation score of 96.02 is greater than or equal to break threshold 95`; `shared/src/compliance` 94.48%, `profiles/se.ts` 90.00%, `profile-registry.ts` 92.00%                                                                                                                                                                                                                                                                     |
| Docs build                                               | `mkdocs build --strict`                   | `Documentation built in 0.58 seconds`, no warnings                                                                                                                                                                                                                                                                                                                                                                                        |
| Docs translation                                         | `node scripts/docs-translation-check.mjs` | `16 translated page(s) current, 0 not translated yet`                                                                                                                                                                                                                                                                                                                                                                                     |
| Property-based tests                                     | —                                         | **skipped.** The derivation is a boolean over a boolean field and a two-element type list; the D-table enumerates its whole input space, so a generator would restate it                                                                                                                                                                                                                                                                  |
| Real execution                                           | Expo web preview                          | **attempted, blocked.** `expo start --web` bundled and ran (`Web Bundled 2328ms … 2241 modules`), but the renderer froze at the first screenshot — synchronous `expo-sqlite` on a web page that is not cross-origin isolated (ADR 0012's known limitation; the Metro dev server cannot send COOP/COEP). No emulator and no Gradle: the machine is shared and the task brief forbids both. **The UI has therefore not been seen running.** |
| Supply chain                                             | —                                         | no dependency changed; `pnpm licenses:check` green                                                                                                                                                                                                                                                                                                                                                                                        |
| Suite health                                             | —                                         | **not run.** No randomized-order run; the suites here are deterministic unit tests with no shared state, but that is an argument, not a measurement                                                                                                                                                                                                                                                                                       |

### Mutation survivors in the changed code (2, both classified equivalent)

```
shared/src/compliance/profiles/se.ts:39:21   ConditionalExpression
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

Equivalent in observable behavior. Any default whose elements are not facts
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
- Migration `0002` skips `0001`, which belongs to the open PR #296. It was
  **regenerated**, not stacked on: nothing is merged or released, so
  `drizzle-kit generate` was rerun against the revised `schema.ts` and the
  result renumbered `0001` → `0002` by hand (journal `idx`/`tag`, file names).
  `migrations.js` is hand-maintained and was restored after drizzle-kit
  rewrote it. The journal tolerates the gap, but `meta/0002_snapshot.json`
  still records `prevId` of the `0000` snapshot: once #296 lands, regenerate
  the snapshot on rebase, and add `0001_drop_vault_document_id` to
  `migrations.test.ts`'s expected chain.
- **The derived default is now the lighter case.** A shooter with a handgun on
  file and no explicit Settings choice is measured against 6 § (6 activities),
  not 5 § (12). That is the maintainer's decision, stated in the spec and in
  both languages of the manual; it reverses #281's fail-safe direction, and it
  is the one thing in this PR worth a second look.
