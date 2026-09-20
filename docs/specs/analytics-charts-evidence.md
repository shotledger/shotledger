# Evidence: charts that can be read

Spec: [`analytics-charts-spec.md`](analytics-charts-spec.md). Issue #349, the
chart item. Tier 2.

## Spec approval: NOT obtained (autonomous run)

The maintainer chose the **shape** on 2026-09-20 — all three faults, mixed
maxima resolved as one line per discipline — and then instructed that the
remaining queue be completed overnight while they slept. The spec was written
and executed without the correlation-breaking review that approval provides.

**What that costs, stated plainly:** every artifact here was authored by the
same agent, so nothing independent checked that the spec expresses what
matters. The gauntlet below shows the code satisfies the spec; it cannot show
the spec was the right spec. Confidence is claimed accordingly, and the spec is
the artifact to review after the fact.

## Behaviour → test mapping

`app/src/components/time-series-chart-math.test.ts` unless marked otherwise.

| Criterion                                   | Test                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| AP-1 point carries its discipline           | `shared/src/scoring/analytics.test.ts` → `AP-1`                            |
| AP-2 no other field changes                 | `analytics.test.ts` + `sighter-scope.test.ts` pass untouched               |
| TC-1 first point left, last point right     | `TC-1: the earliest point is at the left edge and the latest at the right` |
| TC-2 placed by time, not by index           | `TC-2: a point is placed by time, not by its position in the array`        |
| TC-3 shared timestamps, no NaN              | `TC-3: points that all share one timestamp land mid-plot, with no NaN`     |
| TC-4 single point mid-plot                  | `TC-4: a single point lands mid-plot`                                      |
| TC-5 array order irrelevant                 | `TC-5: array order does not affect placement`                              |
| TC-6 year needed across a boundary          | `TC-6: true when the range crosses a calendar year`                        |
| TC-7 no year within one year                | `TC-7: false within one year, including its first and last day`            |
| TC-8 empty / single                         | `TC-8: false for an empty list and for a single point`                     |
| TC-9 one line per discipline                | `TC-9: one line per discipline, each with only its own points`             |
| TC-10 stable colour order                   | `TC-10: lines are ordered by discipline id, so colours are stable`         |
| TC-11 chronological points                  | `TC-11: each line's points are chronological`                              |
| TC-12 rejected point dropped                | `TC-12: a rejected point is dropped, and a discipline left empty…`         |
| TC-13 empty input                           | `TC-13: no points, no lines`                                               |
| (extra) palette overflow never cycles a hue | `TC-14: past the palette, the busiest are kept and the rest are counted`   |

Negative constraints:

| Constraint                       | How it is held                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| N-1 existing analytics unchanged | no signature touched; `analytics.test.ts` and `sighter-scope.test.ts` pass with assertions unedited |
| N-2 100% coverage on scoring     | `pnpm coverage`: 100% statements / branches / functions / lines                                     |
| N-3 no new dependency            | no `package.json` or lockfile change; charts remain hand-drawn `react-native-svg`                   |
| N-4 no schema change             | no migration, no write path                                                                         |
| N-5 Shot Distribution untouched  | `distribution-bar-chart.tsx` not in the diff                                                        |
| N-6 i18n both languages          | `pnpm i18n:check`: 1040/1040 keys, 0 issues                                                         |

## Gauntlet

Source state: `6c697be` plus the evidence commit that follows it on
`feat/stats-charts-349`. All numbers from one run after the last code edit.

| Layer          | Command                                             | Result                                                                                                               |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Full suite     | `pnpm check`                                        | **2237 passed** (vitest) + **35 suites** (jest), 0 failed                                                            |
| Types          | `pnpm typecheck`, `pnpm typecheck:app`              | clean                                                                                                                |
| Lint / format  | `pnpm lint`, `pnpm format`                          | clean                                                                                                                |
| i18n           | `pnpm i18n:check`                                   | 1040/1040 keys, 0 issues                                                                                             |
| Coverage       | `pnpm coverage`                                     | **100%** — statements 2600/2600, branches 1550/1550, functions 603/603, lines 2229/2229                              |
| Mutation       | `pnpm mutation`                                     | 95.92 overall ≥ 95 threshold. `analytics.ts` **98.32**, 234 killed, 4 survived — the same four equivalents as before |
| Docs           | `mkdocs build --strict`, anchors, translation-check | clean; 18 translated pages current                                                                                   |
| Real execution | emulator, demo data, report screen                  | see below                                                                                                            |

### The palette was computed, not eyeballed

Run through the `dataviz` skill's validator against this app's own card
surfaces, both modes:

```
light (surface #F4F1F8): lightness band PASS · chroma floor PASS
                         CVD separation PASS (worst adjacent ΔE 9.1)
                         normal-vision floor PASS (worst adjacent ΔE 19.6)
                         contrast WARN — 4 slots below 3:1
dark  (surface #221934): all five checks PASS
```

The light-mode contrast WARN is a **documented conditional relief**, not a
dismissable warning: it is legal only with visible labels. The relief shipped
is the legend, which is always drawn for two or more lines and carries the
discipline **name in text ink** beside a colour swatch — so identity is never
colour alone. Hues are assigned in fixed order and never cycled; past eight
disciplines the chart names how many it omitted instead.

### Real execution

Driven on the emulator against demo data. "Passpoäng" now draws **three
separate lines** — Träning (ringtavla), Militär snabbmatch, Precision — each in
its own colour with the legend beneath. The milsnabb line sits in the 500s and
the precision line around 200–280, which is exactly the separation the single
saw-toothed line used to hide.

### Known limits

- **The year-label behaviour was not seen on screen.** Demo data spans 2026
  only, so `axisNeedsYear` correctly returns false and the labels read
  "21 mars · 19 juni · 17 sep.". The cross-year case is covered by TC-6 and
  TC-8 but has not been observed rendered. It would show on the maintainer's
  real 2023–2026 data.
- **No hover/tooltip layer.** The `dataviz` guidance ships one by default, but
  that assumes a pointer; this is a phone. Exact values are already in the
  report's records rows above the charts. A touch-based inspector is a
  separate piece of work, not a silent omission.
- **One shared y-axis per chart.** Deliberately not a dual axis — that is the
  anti-pattern the guidance names first. Lines of different maxima are made
  readable by colour and legend, not by a second scale.
