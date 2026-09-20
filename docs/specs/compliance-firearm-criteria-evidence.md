# Per-firearm FAP 551-3 criteria — evidence report

Spec: [`compliance-firearm-criteria-spec.md`](compliance-firearm-criteria-spec.md).
Read that first — this report only shows the spec's contract was met.

- **Source state:** branch `feat/compliance-firearm-criteria`, off `origin/main`
  at `769abd4`. Numbers below are from fresh runs after the last code edit.
- **Spec approval:** not obtained (autonomous run). Issue #329 is the
  maintainer's statement of what to build and was an _input_ to the spec, not
  approval of it, so the correlation-breaking review did not happen and this
  report claims correspondingly lower confidence. The spec was committed at
  `28de556`, before any implementation commit, so later drift is a `git diff`.
- **Tier:** 2.

## Behaviors

Every row of the spec's `F` and `C` tables is an executable test.

| Layer                                       | Command                                                     | Result                             |
| ------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `F1`–`F22` (+ `F4b`, `F5b`, `F11b`, `F13b`) | `vitest run shared/src/compliance/firearm-criteria.test.ts` | 27 passed                          |
| `C1`–`C6`                                   | `vitest run shared/src/compliance/constants-se.test.ts`     | included below                     |
| whole repo                                  | `pnpm check`                                                | 2183 vitest + 360 jest, all passed |

The four tests beyond the spec's tables were added to kill surviving mutants
(below); each states a real behavior the tables had left implicit.

## Gauntlet

| Layer                      | Command                                             | Result                                               |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| typecheck (shared/backend) | `pnpm typecheck`                                    | clean                                                |
| typecheck (app)            | `pnpm typecheck:app`                                | clean                                                |
| schema / i18n / licenses   | part of `pnpm check`                                | `1034 keys, 0 issues`; schema and licenses unchanged |
| lint + format              | `pnpm lint`, `pnpm format`                          | clean                                                |
| unit + integration         | `pnpm check`                                        | **2183** vitest, **360** jest, 0 failures            |
| coverage                   | `pnpm coverage`                                     | **100%** statements / branches / functions / lines   |
| mutation (whole config)    | `pnpm mutation`                                     | **95.72**, at or above the break threshold of 95     |
| docs — links and nav       | `mkdocs build --strict`                             | exit 0                                               |
| docs — translations        | `node scripts/docs-translation-check.mjs`           | 18 pages current, 0 untranslated                     |
| docs — dangling anchors    | `mkdocs build \| grep "does not contain an anchor"` | 0 matches                                            |

The anchor gate is `scripts/docs-anchor-check.mjs`, which lands on a separate
branch (#343, PR #344); until it merges the grep above is the same check run by
hand. The four manual pages this change edits cross-link by anchor, which is
exactly the failure it exists to catch.

### Mutation, measured against a baseline

`pnpm mutation` runs the whole config and passed at **95.72**. To say anything
about `shared/src/compliance` specifically, the same run was repeated scoped to
that directory on **this branch** and on **`origin/main`'s version of the same
files**, so the two are comparable:

| File                  | `origin/main` survivors | This branch | Note                                             |
| --------------------- | ----------------------: | ----------: | ------------------------------------------------ |
| `firearm-criteria.ts` |                       — |       **0** | new, 100.00                                      |
| `status.ts`           |                       — |           2 | the two that used to be in `license-activity.ts` |
| `license-activity.ts` |                       6 |           4 | the other four, unchanged                        |
| `profiles/se.ts`      |                       1 |           2 | +1 equivalent mutant, below                      |
| `months.ts`           |                       2 |           2 | untouched                                        |
| `profile-registry.ts` |                       2 |           2 | untouched                                        |
| `indicators.ts`       |                       1 |           1 | untouched                                        |
| **scoped score**      |               **93.37** |   **95.17** | baseline was under the threshold                 |

So the module's mutation score **rose**, and the six survivors in
`license-activity.ts` on `origin/main` are the same six — four still there,
two now living in `status.ts` because the banding moved. No survivor was
introduced anywhere this change did not already own.

**The one new survivor is equivalent**, and identical in shape to one already
on `origin/main`:

```
profiles/se.ts:113   firearm.weaponType !== null &&   →   true &&
```

`SE_HANDGUN_WEAPON_TYPES.includes(null)` is `false` at runtime, so removing the
guard changes no behaviour — it is there to narrow `string | null` to `string`
for TypeScript. The identical mutant at `se.ts:54`, in `deriveSeVariantId`,
survives on `origin/main` for the same reason.

**Nine survivors in `firearm-criteria.ts` were real and were killed**, not
argued away. They clustered on two lines, and each pointed at a behavior the
spec asserted but no test pinned:

- `if (t < spanStartMs || t > spanEndMs) continue` — six mutants, all surviving
  because no test had a session belonging to _another_ firearm outside the
  reported span. `F4b` now puts one at each edge (exactly at the open, exactly
  at `now`, one second either side).
- `rule.windowMonths * rule.windowCount` → `/` — survived because `* 1` and
  `/ 1` agree, and only the single-window rule was exercised here. `F11b` uses
  the renewal rule, where the two give 24 months and 6.
- `session.type === 'training' ? …` — two mutants, surviving because `F13`
  weighted competition to 0 and logged only competition sessions, so every
  branch produced 0. `F13b` logs one of each.

## Negative constraints

| #   | Constraint                                           | Evidence                                                                                                                          |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| N1  | `shared/compliance` never imports from `app/`        | no `app/` import in the diff; `pnpm typecheck` would fail on one                                                                  |
| N2  | `months.ts`, `indicators.ts` unmodified              | absent from `git diff --stat`                                                                                                     |
| N2  | `license-activity.ts` changes only by the extraction | `git diff --stat`: **1 insertion, 7 deletions** — one import in, the `statusFor` body out                                         |
| N3  | `LicenseActivity` gains no field                     | `types.ts` diff adds only new interfaces; the 5 §/6 § tests pass unchanged except for one `firearmCriteria: []` in a test fixture |
| N4  | `firearmId` changes no existing count                | the whole existing compliance suite passes untouched; it is optional and only the new module reads it                             |
| N5  | no undocumented number                               | `C3` asserts every criterion field equals its constant; the only literal is `windowCount: 1`                                      |

## Real-execution layer

Driven on the `shotledger` emulator against a real 267-session dataset (11,615
shots, six firearms, all but one imported without a weapon type) rather than
demo data, which the maintainer chose to preserve. No screenshot from that run
is committed: hard rule 7 forbids it, and the firearm names are real.

What the run confirmed, on the `Pardini SP` — the one firearm with a weapon
type on file:

- The **Föreningsintyg Criteria** card appears under License Activity, showing
  `Additional Handgun — not met`, `0 of 2 activities with this firearm,
2026-03-20 to 2026-09-20` (the six-month window, correct for the date), the
  criterion's explanation, and the attestation note.
- **Only** the additional-handgun criterion appears. The firearm is a pistol
  marked _My Own_ with no licence recorded, so `hasTimeLimitedPermit` is false
  and the renewal criterion is correctly absent — behavior `F15`, on real data.
- The 5 §/6 § card beside it is unchanged: `54 activities in the last 6 months
— 12 required`, `On Track`. `N3` holds where it matters.

**It also found a defect no test could.** The card showed `0 of 2 activities
with this firearm` with nothing to explain it, while the card directly above
said 54. `otherFirearmSessionCount` was computed and never rendered — the
unattributed count was, and on this dataset it is always 0, so the gap was
invisible to every unit test. Fixed in the same branch; the card now reads
`54 sessions in the period were logged with a different firearm, so they count
towards those instead`, and 54 matches the License Activity figure exactly.

Two environment findings from the run are recorded in CLAUDE.md rather than
here, since they are not about this change: `expo run:android` builds an
ABI-restricted APK matching the connected device, and Fast Refresh does not
reload the i18n resources.

## What this report does not show

- **That the reading of the source is right.** No gauntlet layer can check a
  regulation. It is addressed by quoting the form verbatim in the spec and
  citing it at every constant — and the two proxies (an owned pistol/revolver;
  a licence with an end date) are app-level judgements, named on screen and in
  the manual, not claims about what the police count.
- **That attestation is handled.** It deliberately is not. The app counts; only
  a person can attest.
