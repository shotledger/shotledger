# Session Stats — inner tens per series — evidence report

> Old-coder EVIDENCE artifact for `feat/session-stats-inner-tens`.
> Absolute path:
> `/home/jimisola/cloud/dev/clones/jimisola/github/shotledger/docs/specs/session-stats-inner-tens-evidence.md`
> Spec: `docs/specs/session-stats-inner-tens-spec.md` (committed at 4f9d434,
> before any implementation, so drift is a `git diff`).
>
> **Spec approval: NOT OBTAINED (autonomous run).** Spec and implementation come
> from the same session, so the correlation-breaking review the loop depends on
> did not happen. Claim confidence accordingly: the gauntlet shows the code does
> what the spec says, not that the spec says everything that matters.

Tier **2**. Source state: the last code commit on
`feat/session-stats-inner-tens` (this report and the spec revision are the only
later commit). Baseline: `main` at 9e2f242. Every number below comes from one
fresh run of each layer executed after the last code edit.

The run happened in this agent's git worktree, which differs from the landing
tree only in gitignored build state (`node_modules`, `.stryker-tmp`,
`coverage/`, `app/android/`). No `.env` or generated source is involved.

## 1. Spec → test mapping

| spec id                                     | verified by                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IT-1                                        | `totals.test.ts` › `IT-1: no series at all means no average`                                                                                                 |
| IT-2                                        | `IT-2: averages the per-series inner-ten counts`                                                                                                             |
| IT-3                                        | `IT-3: a sighter series is in neither the numerator nor the denominator`                                                                                     |
| IT-4                                        | `IT-4: final series are included`                                                                                                                            |
| IT-5                                        | `IT-5: a scored series with no shots yet is not a zero in the denominator`                                                                                   |
| IT-6                                        | `IT-6: only sighters, or only empty scored series, means no average`                                                                                         |
| IT-7                                        | `IT-7: scored series with no flagged shot average a real 0, not null`                                                                                        |
| IT-8                                        | `IT-8: decimal shot values count identically — the flag decides, never the value`                                                                            |
| IT-9                                        | `IT-9: a WS1 override series counts in the denominator with 0 inner tens`                                                                                    |
| IT-10                                       | `IT-10: a non-integer average is returned exactly, unrounded`                                                                                                |
| property (spec §6)                          | `IT-P1: equals sessionInnerTenCount over the count of qualifying series` (fast-check)                                                                        |
| INV-1 (`seriesAverageTenths` unchanged)     | its eight pre-existing tests A-S1..A-S6 + two WS1 cases, **not edited** in this branch — `git diff main -- shared/src/scoring/totals.test.ts` is append-only |
| INV-2 (no signature change)                 | `pnpm typecheck` + `pnpm typecheck:app`, both clean; the only interface change is an **optional** field                                                      |
| INV-3 (100% coverage)                       | `pnpm coverage`, §2                                                                                                                                          |
| INV-4 (no new dependency, no schema change) | `git diff main --stat` touches no `package.json`, no `pnpm-lock.yaml`, no `drizzle/`                                                                         |
| UI-1..UI-3                                  | type-checked and lint-clean; visual confirmation is the maintainer's on-device pass (§4, skipped layer)                                                      |
| UI-4                                        | `app/src/i18n/plurals.test.ts` (jest) — both languages, counts 0/1/30                                                                                        |

## 2. Gauntlet

| layer                    | command                                                   | result                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full suite               | `pnpm check`                                              | green: `tsc -b`, `tsc --noEmit -p app/tsconfig.json`, `i18n-check` (821/821 keys, 0 issues), `eslint .`, `prettier --check .`, `vitest run` **106 files / 1546 tests passed**, `jest` **22 suites / 205 tests passed** |
| coverage                 | `pnpm coverage`                                           | statements 100% (1909/1909), branches 100% (1069/1069), functions 100% (456/456), lines 100% (1643/1643) — threshold layer, exits nonzero when missed                                                                  |
| mutation                 | `npx stryker run --mutate 'shared/src/scoring/totals.ts'` | **62 mutants, 62 killed, 0 survived, 0 timeouts, 0 errors — 100.00%** (break threshold 95)                                                                                                                             |
| checker negative control | `node scripts/i18n-check-negative-control.mjs`            | 5/5 controls behaved as specified (§3)                                                                                                                                                                                 |
| baseline                 | `git switch --detach main && pnpm check`                  | green on `main` (9e2f242): vitest **106 files / 1535 tests passed**, jest **21 suites / 203 tests passed**. Zero pre-existing failures, so the branch's 1546 + 205 is +11 vitest / +2 jest tests and zero new failures |

RED was observed before any implementation: with `seriesInnerTenAverage` a
throwing stub, `npx vitest run shared/src/scoring/totals.test.ts` reported
**11 failed | 29 passed (40)** — every new test failing on behaviour
(`Error: not implemented`), not on import. After GREEN the same command reported
40 passed.

`app/src/i18n/plurals.test.ts` passed on first run (the i18n keys were added just
before it), so it was proved non-vacuous with a throwaway mutant: deleting
`stats.distributionTitleWithCount_one` from `en.json` made it fail with
`Received: "stats.distributionTitleWithCount"` — i18next falling back to the raw
key, exactly the silent failure the test exists to catch. The key was restored.

## 3. Checker negative control (`scripts/i18n-check.mjs`)

This branch **widens** what the i18n gate accepts: a key ending in a CLDR plural
suffix now counts as referenced when its base key is. A widened gate must be
proved still able to fail, so `scripts/i18n-check-negative-control.mjs` (in the
repo, reproducible) mutates the inputs and asserts the exit code:

```
ok   baseline is green — expected pass, exit 0
ok   (a) a key missing from sv.json — expected fail, exit 1
ok   (b) an unused non-plural key in both languages — expected fail, exit 1
ok   (c) an unused PLURAL key whose base key is unreferenced — expected fail, exit 1
ok   (d) the plural rule removed makes the real plural keys fail — expected fail, exit 1
i18n-check negative control: all 5 controls behaved as specified
```

(d) is the non-vacuity proof: with the suffix strip reverted, the two real
plural keys go red, so the new rule — and not some unrelated leniency — is what
makes them pass.

**What this buys, precisely:** four known-bad inputs reach the gate's failure
path. It does not prove the gate recognises every possible i18n defect; it never
did (it checks key-set parity and literal reference, not translation quality or
interpolation arity).

## 4. Layers skipped, and why

- **Real execution on a device.** Not run: the task instruction is explicit —
  _"Do not run the Android emulator or Maestro — I will do the on-device
  verification."_ The three UI changes are therefore **unverified visually**;
  the layout argument in the spec is arithmetic over the measured padding
  constants, not a screenshot. The one item to look at first is whether the
  four-tile results card stays on one line with "X (Inner Tens)" legible.
- **Web preview.** Would not have substituted: `expo-sqlite` does not bundle on
  web under this Expo SDK (`app/src/db/client.web.ts` sets `db = null`), so the
  session detail screen renders empty there.
- **Property suite run alone against the mutants.** A Tier 3 step; this is
  Tier 2. The 100% mutation score is attributed to the suite as a whole, not to
  IT-P1 specifically.
- **Supply chain / secrets.** The dependency set is unchanged (no
  `package.json` / lockfile edit), and the diff contains no credential-shaped
  content. No new network, subprocess, filesystem or env capability is used —
  the new code is a pure function over arrays.
- **Suite health (randomized order).** Not run; no test-ordering change was
  introduced and the new tests are pure and stateless.

## 5. Anything that failed, and how

- `pnpm check` failed once on `prettier --check .` (three files: the modified
  screen, this spec, the negative-control script). Fixed with
  `prettier --write` on those paths; no assertion, threshold or test was
  touched.
- The spec's first layout paragraph understated the screen chrome (48 dp
  instead of the measured 64 dp), which made the "four tiles fit at
  `flexBasis: 64`" conclusion wrong. Corrected **visibly in the spec** (§4,
  "Revision") rather than quietly, and the tile geometry changed to
  `flexBasis: 56` accordingly.

Nothing was weakened to reach green: no test broadened, skipped or deleted; the
one gate that changed got the negative-control treatment above.

## 6. Known limits

- A Webshooter-imported (WS1) session has no per-shot detail, so every override
  series contributes 0 inner tens while still counting in the denominator. Such
  a session reads "Avg X/Series 0.0". That is consistent with the X tile beside
  it, which already reads 0 for the same reason — but it is an absence of data,
  not a measured zero, and neither tile distinguishes the two.
- `stats.ts`'s `scoredSeriesTotalsTenths` still carries its own copy of the
  "scored series with data" predicate; only the two functions in `totals.ts`
  share the extracted one. They agree today (both tested), but the lock-step is
  by comment, not by construction.
