# This session vs your usual form — executable spec

Issue #798. The "Vs. Last 100 Series" block on a session's Stats view
compared the latest 100 series of the discipline and class with the 100
before them. It never used the session being viewed, so every session showed
the same two numbers. This replaces it with a comparison of **this session**
against the **100 scored series before it**.

Written before implementation; append-only during the task.

**Spec approval:** not obtained (autonomous run). The maintainer asked for
issues #798–#801 to be worked through overnight (2026-10-13) and was asleep
while this ran. The decisions the issue left to the spec are listed under
"Decisions taken here" so they can be reviewed after the fact.

- **Tier:** 2 (normal). A pure fold over in-memory series; no money, auth,
  concurrency or persistence.
- **Setup plan**
  - Branch `feature/issue-798-session-vs-usual-form-dd7x58` off `origin/main`.
  - Git: DCO-signed commits (`git commit -s`), spec first; one PR.
  - Tools to install: none. New dependencies: none.
  - Files added, by path:
    - `shared/src/scoring/usual-form.ts`, `shared/src/scoring/usual-form.test.ts`
    - `app/src/features/session/usual-form-card.tsx` (the UI block)
    - `app/src/features/session/usual-form-scale.ts` and its test (marker
      positions on the bar)
    - `docs/specs/session-vs-usual-form-spec.md` (this file) and
      `docs/specs/session-vs-usual-form-evidence.md`
  - Files changed: `shared/src/index.ts` (export),
    `shared/src/scoring/stats.ts` and its test (remove `compareRecentSeries`,
    see "Removed"), `app/src/features/session/use-session-stats.ts`,
    `app/src/features/stats/use-stats-data.ts` (drop the unused
    `loadComparisonForSession`), `app/src/app/session/[id]/index.tsx`,
    `app/src/i18n/{en,sv}.json`, `docs/manual/guides/statistics(.sv).md`,
    `docs/manual/explanation/usual-form(.sv).md`, `mkdocs.yml`,
    `docs/implementation-plan.md`.
  - Gauntlet: `pnpm check` (the new module falls under
    `stryker.config.json`'s `shared/src/scoring/*.ts`, so the 100% coverage
    gate applies), `pnpm exec stryker run --mutate shared/src/scoring/usual-form.ts`,
    the docs gates, and the app run in the web preview with the demo data.

## The model

`compareWithUsualForm(seriesList, sessionId, options?)` takes every series
the Stats view already loads (`StatsSeries[]`) and the id of the session
being viewed.

- **The session's series** are its scored series: not sighters, and carrying
  data (shot rows or a stored total), exactly the set `seriesMeanTenths`
  already counts. Finals count, as they do in the view's existing
  per-series figures. If the session has no series in the input at all, the
  result is `null`.
- **The baseline** is every scored series (same rule) of a _different_
  session with the same `disciplineId` and `shooterClass` as the session
  (taken from its first series) and a `startedAt` strictly before the
  session's. They are ordered by `startedAt`, ties keep input order, and the
  last `baselineSize` (default 100) are kept.
- **Per-series figures** (series mean, series SD, expected total, the
  verdict) count stored-total series. **Per-shot figures** (shot mean,
  share of 10s, share of 9-or-better) use shot rows only.
- **A 10** is a shot whose value is at least 10.0 (`valueTenths >= 100`), so
  a decimal 10.4 and an inner ten both count. **9 or better** is
  `valueTenths >= 90`. The shares are `null` for a discipline scored by hits,
  and `null` when the side has no shot rows.
- **Expected total** = baseline series mean × the session's scored series
  count. **Over/under** = the session total − the expected total. The session
  total sums the scored series totals (stored totals included).
- **How unusual**: z = (session series mean − baseline series mean) ÷
  (baseline series SD ÷ √n), n = the session's scored series count. The z is
  never shown; it is turned into a verdict:

  | z           | verdict         | English                   |
  | ----------- | --------------- | ------------------------- |
  | z ≤ −2      | `clearlyWorse`  | Clearly worse than usual  |
  | −2 < z ≤ −1 | `worse`         | Worse than usual          |
  | −1 < z < 1  | `usual`         | About usual               |
  | 1 ≤ z < 2   | `better`        | Better than usual         |
  | z ≥ 2       | `clearlyBetter` | Clearly better than usual |

  The verdict is `null` when the baseline has fewer than 20 series, or the
  session has no scored series. A baseline SD of exactly 0 (every baseline
  series the same) gives `usual` for an equal mean, and `clearlyBetter` /
  `clearlyWorse` for any difference.

- Each difference (`delta*`) is session − baseline, `null` when either side
  is `null`.

### Decisions taken here

1. **20 baseline series** before the app says how unusual a session was.
   Fewer, and the spread the verdict rests on is too rough; the figures are
   still shown, with the count they are based on.
2. **Bands at 1 and 2 standard errors** (table above). About two sessions in
   three of ordinary form land in "About usual"; "Clearly" is roughly one
   session in twenty on either side.
3. **The baseline is strictly earlier sessions**, so a later session never
   changes how an older one is judged, and the session itself is never part
   of its own baseline.
4. **Finals count** on both sides, as they do in the view's existing
   per-series figures.

## Scenarios

```gherkin
Scenario: UF1 the baseline is the 100 series before the session
  Given 120 earlier precision series (class 2) in sessions before session S
  And 5 precision series in a session after S
  When S is compared
  Then the baseline holds the latest 100 of the earlier 120, and none of the later ones

Scenario: UF2 the baseline matches discipline and class, and leaves out sighters and empty series
  Given earlier series of another discipline, another class, a sighter and an empty series
  Then none of them is in the baseline

Scenario: UF3 per-series and per-shot figures
  Given a baseline of series 45, 47 (5 shots each) and a session of series 48, 46
  Then baseline series mean is 460, session series mean is 470, delta 10
  And the per-shot means are 92 and 94, delta 2

Scenario: UF4 expected total and over/under
  Given a baseline series mean of 460 and a session of 3 series totalling 1410
  Then expected is 1380 and over/under is +30

Scenario: UF5 shares of 10s and 9-or-better
  Given a session with shots 10, 10.4, 9, 8, 10(X)
  Then the share of 10s is 3/5 and of 9-or-better 4/5
  And each delta is session share − baseline share

Scenario: UF6 stored totals count per series, not per shot
  Given a session made of one stored-total series (480 over 5 shots) and one shot series (450)
  Then the session series mean is 465 and the total is 930
  And the per-shot mean and shares come from the shot series alone

Scenario: UF7 a hits discipline has no shares
  Given series of spsf-falt
  Then both shares and their deltas are null

Scenario: UF8 no baseline
  Given no earlier series of the discipline and class
  Then baselineSeriesCount is 0, every baseline figure, delta, expected and verdict is null
  And the session figures are still there

Scenario: UF9 a short baseline shows figures but no verdict
  Given 19 earlier series
  Then the figures are compared and the verdict is null
  Given 20 earlier series
  Then there is a verdict

Scenario: UF10 the verdict follows the bands
  Given z values −2, −1.99, −1, −0.99, 0.99, 1, 1.99, 2
  Then the verdicts are clearlyWorse, worse, worse, usual, usual, better, better, clearlyBetter

Scenario: UF11 z uses the standard error of the session's series count
  Given a baseline SD of 20 and a mean difference of 10
  Then one session series gives usual (z 0.5) and sixteen give clearlyBetter (z 2)

Scenario: UF12 a flat baseline
  Given a baseline whose series are all 450
  Then a session mean of 450 is usual, 452 clearlyBetter, 448 clearlyWorse

Scenario: UF13 an unknown session
  Given no series of the session id
  Then the result is null

Scenario: UF14 the session's own series are never its baseline
  Given another session with the same startedAt as S
  Then its series are not in S's baseline

Scenario: UF15 a session of only sighters
  Given session S has only sighter series
  Then the session figures are empty (count 0, means null) and the verdict is null
```

Plus one fast-check property: moving every session series' value up never
makes the verdict worse (the verdict is monotone in the session mean).

## UI (verified in the running app, not by these tests)

The Stats view's comparison block becomes **Vs. Your Usual Form**:

- "Compared with the 100 series before this session." (or the actual count),
  or, with no baseline, "No earlier series of this discipline and class to
  compare with."
- The verdict in words, or "Too few earlier series to say how unusual this
  was." below 20.
- **Avg/Series** and **Avg/Shot** rows: a bar with a "Usual" and a "Today"
  marker, and "Usual 45.20 · Today 46.80 · +1.60".
- **Expected**: "Expected 556.4 · Scored 596 · +39.6".
- **Share of 10s** and **9 or Better** (rings only): "38% · usual 31% · +7".
- Nothing reward-like: no colours that celebrate, no icons, no streaks.
- `docs/manual/guides/statistics.md` and `.sv.md` describe the block;
  `docs/manual/explanation/usual-form.md` and `.sv.md` say how "how unusual"
  is worked out, in plain words.

The web app has no session Stats view, so there is nothing to mirror there.

## Must NOT

- Change any other export of `stats.ts`, or any test other than
  `compareRecentSeries`'s.
- Change the DB schema or add a dependency.
- Show a raw z-score, or invent a baseline when there is none.
- Put any of the maths in the app: it lives in `shared/` so the web can reuse it.

## Removed

`compareRecentSeries` (stats.ts, B24 of `m5-stats-spec.md`) and its tests go:
its only screen was the session Stats block this replaces, and its other
caller, `loadComparisonForSession` in `use-stats-data.ts`, was never called.

## Revisions

- 2026-10-13, during GREEN: the baseline also carries `shotSdTenths` (the
  sample SD of its shot values), so the app can scale the Avg/Shot bar the
  same way as the Avg/Series bar. UF3 asserts it.
- 2026-10-13, during GREEN: with no scored session series (UF15),
  `expectedTotalTenths` and `overUnderTenths` are `null`, not 0, like every
  other figure that has nothing to rest on.
- 2026-10-13: decision 2 said "Clearly" is about one session in twenty on
  either side. Under a normal spread it is about one in forty on each side
  (one in twenty for both together), and "Better"/"Worse" about one in seven
  each. The bands themselves are unchanged; the manual states the corrected
  frequencies.
- 2026-10-13, UI: "Share of 10s" and "9 or Better" show the difference in
  whole percentage points with no unit ("38% · usual 31% · +7"). A legend
  above the bars names the grey mark "Usual" and the coloured mark "Today".
  The manual's "On the web" section says a session's Stats view is phone
  only. A fält session has no Stats view (it has stations, not series), so
  UF7 guards the shared function only.
- 2026-10-13, after mutation: two survivors showed gaps the spec already
  covered. UF15 now also asserts its deltas are `null` (the session side is
  empty, so `null − 460` must not become −460), and a new UF7 test pins that a
  discipline the app does not know is treated as rings.
