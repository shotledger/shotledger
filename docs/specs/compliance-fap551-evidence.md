# FAP 551-3 activity numbers — evidence report

Spec: [`compliance-fap551-spec.md`](compliance-fap551-spec.md). Read that
first — this report only shows the spec's contract was met.

- **Source state:** branch `fix/compliance-fap551-numbers`, off
  `origin/main` at `cfeecb2`. Numbers below are from fresh runs after the
  last code edit, in the agent's own git worktree (dependencies installed
  there with `pnpm i`; nothing gitignored differs from the landing tree that
  the gauntlet depends on).
- **Spec approval:** not obtained (autonomous run). The maintainer's
  2026-09-16 decisions were inputs to the spec, not approval of it — so the
  correlation-breaking review did not happen, and this report claims
  correspondingly lower confidence. The spec was committed at `557338e`,
  before any implementation commit, so later drift is a `git diff`.
- **Tier:** 2.

## Baseline (recorded first)

Two gauntlet layers **already fail on `origin/main`**, in files this change
does not touch. Measured, not assumed: `origin/main`'s `shared/src` and
`app/src` were checked out over the worktree and both layers re-run.

| Layer           | `origin/main` baseline                                                       | This branch                       |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `pnpm coverage` | **fails** — 99.90% lines, 99.87% statements, 99.38% branches (threshold 100) | same three percentages, unchanged |
| `pnpm mutation` | **fails** — global score **92.30**, break threshold 95                       | global score **92.30**, unchanged |

The uncovered lines/branches are in `shared/src/disciplines/index.ts`,
`integrations/webshooter/{api/httpClient.ts,api/spaLogin.ts}`,
`scoring/heatmap.ts` and `timer/mic-diagnostics.ts`; the surviving mutants
are concentrated in `timer/` (`mic-diagnostics.ts` 85.90, `shot-detector.ts`
93.58) and `shotlog/csv-codec.ts`. None of them is touched by this change.
**Zero new failures** is the line held here — fixing the pre-existing ones is
scope creep and is surfaced, not silently absorbed.

Within the files this change does own, both layers are green:

- **Coverage on `shared/src/compliance/**`: 100% lines, branches, functions
  and statements**, every file (`license-activity.ts`, `constants-se.ts`,
  `index.ts`, `indicators.ts`, `months.ts`, `profile-registry.ts`,
  `profiles/se.ts`, `types.ts`).
- **Mutation on `shared/src/compliance`: 95.24%** (140 killed, 7 survived),
  above the 95 break threshold. Baseline for the same directory was 95.49%
  (127 killed, 6 survived) — see "the one new survivor" below.

## Spec behaviors → tests

Every behavior in the spec maps to a named test. Suite files:
`shared/src/compliance/{constants-se,profile-registry,se-license-activity}.test.ts`.

| Spec | Test                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------- |
| C1   | `FAP 551-3 constants > C1: the window is the six months both paragraphs name`                     |
| C2   | `… > C2: 5 § — two per month on average over six months is twelve in total`                       |
| C3   | `… > C3: 6 § — one per month on average over six months is six in total`                          |
| C4   | `… > C4: the modeled numbers are verified against a cited source`                                 |
| C5   | `… > C5: the citation names the form and the regulation, and claims nothing unverified`           |
| P1   | `getProfile > P1: se resolves to the SE profile on its default variant, verified`                 |
| P2   | `getProfile > P2: none resolves to null, whatever variant is asked for`                           |
| P3   | `getProfile > P3: every v1 weapon group resolves to exactly one rule, under either variant`       |
| P4   | `getProfile > P4: the window traces to constants-se.ts (no duplicated literals)`                  |
| P5   | `getProfile > P5: 5 § — the first-handgun variant requires twelve activities`                     |
| P6   | `getProfile > P6: 6 § — the existing-handgun variant requires six activities`                     |
| P7   | `getProfile > P7: an unknown variant id falls back to the default, never null and never empty`    |
| P8   | `getProfile > P8: the se definition offers both cases and names an existing default`              |
| P9   | `getProfile > P9: there is no definition for none`                                                |
| P10  | `getProfile > P10: training and competition count alike, as the form pools them`                  |
| R1   | `the SE profile through license activity > R1: 5 § — twelve activities in the window is on track` |
| R2   | `… > R2: 5 § — eleven is short of the requirement but above half`                                 |
| R3   | `… > R3: 5 § — five is below half of twelve`                                                      |
| R4   | `… > R4: 6 § — six activities in the window is on track`                                          |
| R5   | `… > R5: the same six activities are only amber under 5 § — the case decides`                     |
| R6   | `… > R6: twelve in one week counts — "sammantaget i genomsnitt" is a window total`                |
| R7   | `… > R7: an activity a day before the window does not count toward the twelve`                    |

### Negative constraints

| Spec | How it was checked                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1   | `shared/compliance` imports nothing from `app/` — enforced as before by `tsc -b` (`shared` has no path to `app`) and visible in the diff; no import was added.                                                                        |
| N2   | `git diff origin/main --stat` lists **no change** to `license-activity.ts`, `months.ts` or `indicators.ts`. Only `license-activity.test.ts` changed, and only to add the new required `variantId` field to its local profile fixture. |
| N3   | The only new numbers are in `constants-se.ts`, each with its source phrase in a doc-comment; the two required-activity counts are computed (`rate × window`), not literals — asserted by C2/C3.                                       |
| N4   | Full suite green: 2059 vitest tests, 361 app jest tests, zero failures.                                                                                                                                                               |
| N5   | `profile.verified` and the `unverifiedHint` guard are still in both screens (see `app/src/app/settings/compliance.tsx` and `firearms/[id]/index.tsx`); the string was reworded to drop the FAP 551-3 name.                            |

## RED evidence

Each new test was observed failing before the implementation existed. The
stubs were deliberate: new constants exported as `0`, `getProfileDefinition`
returning `null`, so the failures were assertion failures rather than import
errors.

```
Test Files  3 failed | 3 passed (6)
     Tests  17 failed | 51 passed (68)
```

Sample, from that run:

```
FAIL  se-license-activity.test.ts > R5: the same six activities are only amber under 5 §
AssertionError: expected 'green' to be 'amber'
```

After implementation, the same 17 pass. No test was edited in the same step
as implementation code, and no assertion was weakened at any point.

## Gauntlet layers

All from fresh runs after the final edit.

| Layer                                                         | Command                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite + types + lint + format + i18n + licenses + schema | `pnpm check`                              | **pass** — 129 vitest files / 2059 tests, 37 jest suites / 361 tests, `tsc -b` and app `tsc --noEmit` clean, `eslint .` clean, `prettier --check .` clean, i18n 1042/1042 keys with 0 issues, licenses invariants hold                                                                                                                                                                                                                                                                                                                                           |
| Coverage                                                      | `pnpm coverage`                           | compliance **100/100/100/100**; repo-wide fails at the pre-existing baseline above, unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Mutation                                                      | `pnpm mutation` (Stryker)                 | compliance **95.24%** (140 killed / 7 survived), above break 95; repo-wide 92.30, unchanged from baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Docs — links and nav                                          | `mkdocs build --strict`                   | **pass** — en and sv built, 18 nav elements translated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Docs — translations                                           | `node scripts/docs-translation-check.mjs` | **pass** — 15 translated pages current, 0 untranslated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Supply chain                                                  | —                                         | **not applicable**: no dependency added or removed; `pnpm-lock.yaml` and every `package.json` are untouched in the diff. No new network, filesystem, subprocess or env capability.                                                                                                                                                                                                                                                                                                                                                                               |
| Property-based tests                                          | —                                         | **skipped**, per the spec: four fixed numbers plus calendar arithmetic already covered by boundary tables (R1–R7 here, B4–B7/B19 in m6).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Real execution                                                | —                                         | **skipped, no substitute run.** The machine is shared and the task brief forbids starting an emulator or a Gradle build; the web preview cannot stand in, because `db` is `null` on web (`app/src/db/client.web.ts`), so the profile resolves to `'none'` and the compliance UI hides itself by design. **The Settings case picker and the license-activity card lines have therefore not been seen rendering.** They are ordinary app-layer UI (CLAUDE.md's routine-work tier), typechecked and i18n-gated but not exercised — the one real gap in this report. |
| Suite health                                                  | —                                         | **not run** as a randomized-order pass; the suite is deterministic by construction here (every test pins `now` to a fixed `Date`, no shared mutable state, no clock or filesystem access in `shared/compliance`).                                                                                                                                                                                                                                                                                                                                                |

## The one new survivor

```
[Survived] ConditionalExpression
shared/src/compliance/profile-registry.ts:41:37
-   definition.variants.find((v) => v.id === definition.defaultVariantId)!;
+   definition.variants.find((v) => true)!;
```

**Equivalent, and classified rather than chased.** `find(() => true)` returns
`variants[0]`, and for the only registered profile the default variant _is_
the first one. Killing it would need a second profile whose `defaultVariantId`
is not its first variant — i.e. inventing a jurisdiction to satisfy a mutation
tool, which is exactly the coverage-chasing the anti-gaming rules forbid. The
behavior the mutant leaves intact is itself asserted by P1, P7 and P8.

The other six survivors are unchanged from the M6 baseline and are classified
in [`m6-compliance-evidence.md`](m6-compliance-evidence.md).

## What this report does not cover

- That the spec expresses everything that matters. It was not approved before
  implementation, and no independent verifier ran.
- That the **reading** of "sammantaget i genomsnitt" is the one a Swedish
  police authority would apply. No test can establish that; the spec argues it
  from the form's own words and the manual tells the user plainly what the app
  counts and who actually decides.
- The three rules deliberately left unmodeled (additional handgun, permit
  renewal, särskilda skäl) — absent from the code by decision, present in the
  spec and the user manual.
