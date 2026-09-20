# Photo scoring phase 1 — evidence report

> Evidence for [`docs/specs/photo-scoring-phase1-spec.md`](photo-scoring-phase1-spec.md).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/photo-scoring-phase1-evidence.md`
> Branch: `feat/photo-scoring-phase1`, based on `feat/m7-release` with
> `feat/target-scoring-math` merged in.
>
> **Spec approval: NOT OBTAINED (autonomous run).** The maintainer set the
> scope but did not review the spec before implementation. Confidence is
> claimed accordingly: the gauntlet shows the code does what the spec says,
> it cannot show the spec says everything that matters.

## 1. What the old-coder loop covered, and what it did not

The evidence-first loop was run on the **new shared logic**
(`shared/src/scoring/group.ts`, Tier 2) as CLAUDE.md requires, and on the
three pure app modules where a silent error would be invisible
(`validity.ts`, `corners.ts`, `caliber.ts`, plus `marks.ts` and
`transform.ts`). It was **not** run on the React components or on
`opencv.ts` — see §7 for what that leaves untested and why.

## 2. `shared/src/scoring/group.ts` — spec §3 mapping

| Spec criterion          | Test                                                                    | Result                      |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------- |
| GR1 empty → null        | `group.test.ts` "returns null for an empty group"                       | pass                        |
| GR2 single shot         | "a single shot is its own MPI with zero spread"                         | pass                        |
| GR3 symmetric MPI = 0   | "a group symmetric about the origin has a zero MPI"                     | pass                        |
| GR4 mean radius         | "mean radius is the mean distance from the MPI"                         | pass                        |
| GR5 spread is pairwise  | "extreme spread is the max PAIRWISE distance, not the max from the MPI" | pass                        |
| GR6 elevation sign      | "elevation is positive above the center (input y increases downward)"   | pass                        |
| GR7 windage sign        | "windage is positive to the right of the center"                        | pass                        |
| GR8 degenerate group    | "a degenerate group of identical shots is legal, not an error"          | pass                        |
| GR9 shotCount           | "shotCount is the input length"                                         | pass                        |
| GR10 non-finite throws  | "a non-finite coordinate throws rather than poisoning every statistic"  | pass                        |
| GP1 translation         | `group.property.test.ts` GP1                                            | pass (fast-check, 100 runs) |
| GP2 rotation            | GP2                                                                     | pass                        |
| GP3 scale               | GP3                                                                     | pass                        |
| GP4 ordering            | GP4                                                                     | pass                        |
| GP5 meanRadius ≤ spread | GP5                                                                     | pass                        |

**Negative constraints (spec §3.4):** no new dependency (verified — the
`pnpm add` in this branch added only the two runtime deps in §5 below); no
existing exported signature in `shared/` changed (`shared/src/index.ts` gained
exactly one barrel line, `git diff` on that file is 1 insertion); the 27
pre-existing `shared/` test files still pass unchanged;
`shared/src/scoring/**` was already inside the coverage and Stryker globs, so
`group.ts` came under both with **no config change** — there was no
opportunity to quietly exclude it.

### RED was observed

The stub (`throw new Error('not implemented')`) made **all 15 tests fail on
behavior, not on import**, before any implementation existed.

### One real defect the loop caught

GR3 failed on the first GREEN run: `elevationMm` was `-0` for a centered
group, which would render as `-0.0 mm`. Fixed in the **implementation**
(`0 - y` rather than `-y`), not by relaxing the test.

## 3. Gauntlet layers

All numbers from one fresh run after the last code edit.

| Layer                         | Command                                                  | Result                                                                                                     |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Full suite (vitest)           | `pnpm check`                                             | **511 passed / 45 files**, 0 failures                                                                      |
| Full suite (jest-expo)        | `pnpm check`                                             | **75 passed / 6 suites**, 0 failures                                                                       |
| Static types (shared+backend) | `pnpm typecheck` (`tsc -b`)                              | clean                                                                                                      |
| Static types (app, by hand)   | `cd app && pnpm exec tsc --noEmit`                       | **2 errors, both pre-existing** in `src/db/migration-gate.tsx` and `src/db/queries/sessions.ts`; **0 new** |
| i18n                          | `pnpm i18n:check`                                        | `en.json: 307 keys, sv.json: 307 keys, 0 issues`                                                           |
| Lint                          | `pnpm lint`                                              | clean, 0 problems                                                                                          |
| Coverage                      | `pnpm coverage`                                          | **100 %** statements / branches / functions / lines (1085/1085, 380/380, 93/93)                            |
| Mutation (`group.ts`)         | `npx stryker run --mutate 'shared/src/scoring/group.ts'` | **95.45 %**, 42 killed / 2 survived, above the 95 break threshold                                          |
| Property tests                | included in the vitest run                               | 5 properties, fast-check                                                                                   |
| Supply chain                  | see §5                                                   | 2 new runtime deps, both named in the spec                                                                 |
| Real execution                | see §6                                                   | dev build on the Android emulator, real corpus photos                                                      |

### Baseline

`cd app && pnpm exec tsc --noEmit` had pre-existing errors before this branch
(CLAUDE.md records three as of M3; two remain on `feat/m7-release`). The line
held is **zero NEW errors**. Those two were not "fixed" — that is someone
else's scope.

### Surviving mutants, classified

Both survivors in `group.ts` are **equivalent**, not gaps:

1. `for (let i = 0; i < points.length; …)` → `i <= points.length` in the
   extreme-spread outer loop. The inner loop starts at `i + 1` and is bounded
   by `points.length`, so the extra outer iteration runs an empty inner loop
   and computes nothing.
2. `if (d > extremeSpreadMm)` → `d >= extremeSpreadMm`. On equality the
   assignment writes the value that is already there.

A third survivor (the `RangeError` message string) **was** killable and was
killed by asserting the message — the message names the offending coordinate
pair, which is what makes a field bug report actionable. Score went 93.18 % →
95.45 %.

## 4. The validity gate — calibrated, not chosen

This is the load-bearing new decision, so it gets its own section.

**Harness:** `spike/cv/validity_gate.py`, committed. It imports
`target_cv.py` from `spike/cv-target-scoring` and computes the five spec §2.2
metrics on the real 38-photo corpus at the shipped 2048 px input. Photos live
at `~/tmp/shotledger-cv-spike/targets/` and are **not** in the repo.

```
python validity_gate.py --in ~/tmp/shotledger-cv-spike/targets --out gate_2048.csv
```

### 4.1 The corpus separates cleanly

`zoneContrastGray` — the decisive metric — separates the corpus with an
**empty gap from 17.7 to 84.2**. The shipped threshold of 50 sits inside it,
so it is not perched on the edge of either class.

Applying all five thresholds gives **23 accept / 15 reject**, which matches
the spike report §6.3's own count of **23 locked-or-partial (18 full + 5
partial) / 15 failed** on the same 38 photos.

### 4.2 What the gate rejects — the photos it exists for

| Photo                                | Why it matters                                                                      | axisRatio    | zoneFraction | contrast     | profile    | Verdict                                |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------ | ------------ | ------------ | ---------- | -------------------------------------- |
| `20250906_104730`                    | **Locked onto a treeline and gravel** with a plausible 2.3 mm residual (spike §6.3) | 2.349        | 0.005        | **−111.5**   | 7.05       | rejected on **all four** measured axes |
| `20250906_150442`                    | **Locked onto a gravel bank**                                                       | 6.389        | 0.049        | **−5.6**     | 9.21       | rejected on **all four**               |
| `20260609_181957`                    | Black zone fills the frame — Otsu had no boundary                                   | 38.411       | 0.019        | −87.0        | 7.54       | rejected on all four                   |
| `20260726_153751`                    | Milsnabb face, **profile score 122**                                                | 1.477        | 0.897        | −57.7        | **121.99** | rejected on contrast alone             |
| `20260401_171339`                    | **Profile score 320** on a non-target lock                                          | 1.964        | 1.015        | −21.0        | **320.45** | rejected on zoneFraction + contrast    |
| `20260726_145316`, `20260726_150229` | The other two milsnabb photos                                                       | —            | —            | −50.6, −19.4 | 15.3, 15.8 | rejected                               |
| `20250906_135537`, `20250918_181552` | The two extreme-perspective photos the spike excluded                               | 1.848, 1.926 | —            | 17.7, 14.4   | 12.9, 13.1 | rejected                               |

The last two rows of that table are the point of the whole gate. **A
residual-only or profile-only check would have passed `20260726_153751`
(profile 122) and `20260401_171339` (profile 320)** — both non-targets. Only
the contrast and zone-fraction axes catch them. This is the spike's finding
("the residual is not a validity check") reproduced and then defended against.

### 4.3 What the gate accepts

All 23 accepts are precision faces the spike classed as locked or partial.
The weakest accepted photo is `20260723_191611` (contrast 84.2, profile 33.84,
axisRatio 1.284) — still well clear of both thresholds.

### 4.4 Honest limits of the gate

- **One known false accept.** `20250831_125338` (contrast 132.3, profile
  171.0) passes, but the spike names it a geometry failure — "center
  off-frame; one short arc of the black zone". The measured metrics do not
  distinguish it. The backstop is that the user **sees the ring overlay drawn
  on their own photo** before marking anything, and can fall back to manual
  corners; the gate's job is to stop _confident nonsense_, and on that it is
  clean.
- **Known false rejects.** `20260816_114337` (contrast −20.4) is rejected even
  though spike §3 records stage 4 rescuing it to a 0.55 mm residual — its card
  is cut off left and right, so the contrast annulus falls outside the card.
  This is the conservative direction: the user gets the manual-corner
  fallback rather than a wrong lock.
- The thresholds are fitted to **38 photos from one shooter, one club, two
  target faces**. They are a starting point, not a validated operating curve.
- `profileScore` is normalized by the profile's MAD in `opencv.ts`; the Python
  harness computes the same quantity the same way, but the two implementations
  are **separate code**, so the calibration transfers only as far as that
  correspondence holds. This is the weakest link in the calibration chain and
  is stated rather than glossed.

### 4.5 Negative control on the gate

`validity.test.ts` asserts the rejected corpus photos with their **measured**
numbers, and `checkGeometryValidity` was confirmed to fail on each. The V9
cases prove the NaN path: every check is a negated comparison, so a NaN metric
fails rather than comparing its way to `valid`.

## 5. Supply chain

Two new runtime dependencies, both named in the spec:

| Package                    | Version  | License | Why                                                                                                                                                              |
| -------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-fast-opencv` | ^1.0.1   | MIT     | Named in `docs/implementation-plan.md` §2 for this feature. New-architecture only; **no Expo config plugin** — works under prebuild/dev-client/EAS, not Expo Go. |
| `expo-image-manipulator`   | ^57.0.14 | MIT     | The 2048 px resize and the full-resolution loupe crop.                                                                                                           |

**`react-native-vision-camera` was installed and then removed.** v5.2.3
declares `react-native-nitro-modules` and `react-native-nitro-image` as peers —
**three** new native modules for still-photo capture that `expo-image-picker`
(already a dependency, already used for series photos) does with
`launchCameraAsync`. See §8 deviations.

`pnpm peers check` reports two unmet peers (`jest-watch-typeahead` wanting
jest ≤29, `vitest@4` wanting a matching coverage package) — **both
pre-existing**, neither introduced here.

No secret entered the tree. The corpus photos are personal and were **never**
committed; they are read from `~/tmp/shotledger-cv-spike/` and pushed to the
emulator at verification time only.

## 6. Real execution — Android emulator

See §9 for the run log and screenshots.

## 7. What is NOT covered — read this part

The gauntlet's reach stops in specific places, and pretending otherwise would
be the failure this whole scheme exists to prevent.

- **`opencv.ts` has no automated test at all.** It needs a device with the
  native OpenCV binaries; there is no headless harness for it in this repo.
  Its correctness rests on (a) being a close port of Python that was measured
  on 38 photos, (b) delegating every arithmetic decision to modules that _are_
  tested, and (c) the emulator run in §9. A logic error in the ray-cast walk
  or the `warpPolar` reduction would not be caught by any layer here.
- **The React components have no tests.** `@testing-library/react-native` is
  not a dependency and one was not added. The mark reducer, the scoring, the
  transforms and the gate are all tested _underneath_ the components, so what
  is untested is the wiring and the rendering, which is what §9 exercises by
  hand.
- **iOS is entirely unverified.** No Android-only module is used, so it should
  work — but `react-native-fast-opencv` ships **OpenCV 4.9.0 on iOS and 4.12.0
  on Android**, and per the CLAUDE.md iOS rule that difference deserves a real
  test that has not happened.
- **The gate's thresholds are fitted, not validated.** §4.4.
- **Accuracy of a marked score is unmeasured.** Phase 1 makes no accuracy
  claim: the rings come from geometry the spike measured at 0.51 mm median
  residual, but where the _user_ taps is the user's business, and no
  ground-truth comparison of a tapped series against a hand-scored one was
  performed.
- **Mutation testing did not run on the app-side modules.** Stryker's config
  covers `shared/` only. `shot-marks.ts` and `corners.ts` were instead put
  through **manual mutation** (§7.1), which is weaker: the mutants were chosen
  by the same agent that wrote the code.

### 7.1 Manual mutation, and the two holes it found

Both of these were real gaps in the tests, found by mutants that **survived**:

| Module          | Mutant                                 | Outcome                                                                                                                                                                                                                                               |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shot-marks.ts` | `clearSeriesMarks` made a no-op        | **SURVIVED.** The reads join through `shots`, so an orphaned mark is invisible to them — but it is a live row pointing at a soft-deleted shot, exactly what the sync foundation must not see. Fixed by asserting on the raw table; mutant now killed. |
| `shot-marks.ts` | sighter filter dropped                 | killed (1 test)                                                                                                                                                                                                                                       |
| `shot-marks.ts` | finite/caliber guard dropped           | killed (2 tests)                                                                                                                                                                                                                                      |
| `corners.ts`    | sign flip in the DLT perspective terms | killed (1 test)                                                                                                                                                                                                                                       |
| `corners.ts`    | degenerate pivot guard removed         | **SURVIVED.** Exactly-collinear input produces NaNs that the finiteness check catches anyway; only a _near_-degenerate quad (collinear to 1e-14) produces huge-but-finite garbage that needs the pivot guard. Test added; mutant now killed.          |
| `corners.ts`    | reference-point order rotated          | killed (4 tests)                                                                                                                                                                                                                                      |

## 8. Deviations from the maintainer-set scope

1. **`react-native-vision-camera` not used; capture goes through
   `expo-image-picker`.** The maintainer's scope said "camera
   (react-native-vision-camera per §2 — flag its companion deps) **or**
   library (existing expo-image-picker)". VisionCamera 5.2.3 needs
   `react-native-nitro-modules` + `react-native-nitro-image`, and v5 no longer
   ships an Expo config plugin. That is three native modules and a manual
   permissions setup to take a still photo that `expo-image-picker`
   (`launchCameraAsync`) already takes, at `quality: 1` with no editing.
   **Both camera and library paths ship**, just not on VisionCamera. Revisit
   if phase 2 wants a live frame-processor preview (auto-lock while aiming) —
   that is the case where VisionCamera actually earns its dependencies.
2. **`fitEllipseDirect` not patched in.** Per the maintainer's instruction,
   plain `fitEllipse` + the TS refinement. No fork is carried.
3. **The milsnabb annulus inner diameter is approximated** in
   `target-face.tsx` as the X-ring radius, because `TargetFaceDefinition`
   carries only the black zone's _outer_ diameter. This affects rendering of
   the milsnabb face only, which phase 1 does not support. If the real inner
   diameter matters it belongs in `targets.ts` as a field.
4. **"Points lost" analysis not built.** The maintainer marked it "MAY land if
   trivial". It is not trivial to do well and the Score-Analysis screen is
   explicitly phase 2, so it was left out rather than half-done.
5. **`app/tsconfig.json` gained `"types": ["jest"]`.** Without it, the first
   non-`src/db` app test files produced ~100 `Cannot find name 'describe'`
   errors in the by-hand app typecheck. This is config, not behavior.

## 9. Emulator verification — real corpus photos, end to end

**Setup.** `shotledger` AVD (`emulator-5554`). The APK on it belonged to
another agent's branch, so it was `adb uninstall`ed first and a fresh
`pnpm exec expo run:android` build installed — the screenshots are this
branch's binary. Build succeeded in 51 s; `libopencv_java4.so` (55.8 MB) and
`libreact-native-fast-opencv.so` (685 KB) are in the APK, and logcat confirms
`libreact-native-fast-opencv.so … ok` loaded at runtime. **Autolinking of the
new native module worked with no config-plugin entry**, as the spec predicted.

Three real corpus photos were pushed into the media store and scanned in:

```
adb push ~/tmp/shotledger-cv-spike/targets/<name>.jpg /sdcard/Pictures/
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/<name>.jpg
```

Chosen deliberately: two the gate accepts (`20250921_130706`,
`20251025_105532`) and one it rejects (`20250906_150442`, the gravel bank).
**The photos were never committed.**

### 9.1 What the run showed

| #   | Screenshot                             | Result                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `24-relocked.png`                      | **Geometry lock on a real photo.** The cyan ring overlay sits on the printed ring lines across the whole card, X ring through ring 1. This is the whole feature working: OpenCV on-device, `buildRectification` + `coarseToFineRefine` from `shared/`, overlay drawn through `targetMmToImage`. |
| 2   | `10-marked.png`                        | Tap-to-mark: caliber-sized discs, selected one blue, others red. Taps near an existing mark selected it instead of stacking a new one.                                                                                                                                                          |
| 3   | `11-score-line.png`                    | Score line `29-0x` with per-shot values `10 10 9` sorted descending; Move / Delete / X (center ten); caliber picker with `.22` preselected from the session's firearm.                                                                                                                          |
| 4   | `12-loupe.png`                         | **The loupe, and the reason it exists.** A full-resolution crop showing an actual .22 hole with torn fibers, the printed ring line and the "9" digit under the crosshair. At the 2048 px geometry resolution this detail is not there.                                                          |
| 5   | `21-rejected.png`                      | **The validity gate rejecting the gravel-bank photo**, with Retake and "Place corners myself".                                                                                                                                                                                                  |
| 6   | `22-corners.png`, `23-corner-drag.png` | Manual 4-point fallback: four numbered handles over the photo (sky and gravel plainly visible), guide quad, drag working.                                                                                                                                                                       |
| 7   | `17-group.png`, `18-group-stats.png`   | Group view: clean vector target, shots, MPI cross, red mean-radius circle; Windage 1.2 mm / Elevation 15.5 mm / Mean radius 23.1 mm / Max spread 46.8 mm; "3 marked shots"; the reused M5 per-ring histogram.                                                                                   |
| 8   | `15-toggle.png` (after fix)            | Series 7 reads `10 9 10` = **29** with a "Photo attached" chip — a photo-scored series written through `saveSeriesShots`, indistinguishable from a keypad-entered one.                                                                                                                          |

### 9.2 The gate result that matters most

`20250906_150442` was rejected on device with **exactly the four reasons the
Python calibration predicted for that photo** — "too angled or not round"
(axisRatio), "fills too much or too little of the frame" (zoneFraction), "no
black zone found against the card" (zoneContrast), "ring lines could not be
found" (profileScore).

This is stronger evidence than the calibration alone. §4.4 flagged the
Python-harness-vs-`opencv.ts` correspondence as the **weakest link in the
calibration chain**; an independent TypeScript implementation reproducing all
four failing axes on the same photo is direct evidence that the link holds —
for this photo. It is one photo, not the corpus, so the caveat is narrowed,
not removed.

### 9.3 A real bug the run caught

`useSessionGroup` originally memoised on `sessionId` alone, so returning from
the scan screen — **the exact moment a session first gets marks** — left the
Group tab hidden until the screen was recreated. Fixed to refetch on focus,
matching `useSessionDetail`. Confirmed by re-entering the session: the Group
tab appears (`16-toggle.png`).

This is the class of defect no unit layer here could have caught, and it is
why "real execution" is a gauntlet layer.

### 9.4 What the run did NOT capture — the edge-call visual state

**Not captured, and not faked.** The edge-call UI (distinct marker ring plus
the two-candidate "your call" toggle) never rendered on device because the
edge-call band is, by definition, **1 mm wide** — about 3 display px at this
photo's scale, or ~14 px of loupe drag. Repeated attempts landed either side
of it (`25-edge-call.png` scores 9 with margin > 1 mm; `27-edge.png` overshot
to 8), and this sandbox's software-rendered emulator does not place drags
reliably at that scale. A final attempt to reach it by cycling calibers lost
the screen state instead.

The behavior underneath it **is** tested: `marks.test.ts` asserts that a
center at 15.30 mm flags `edgeCall`, that the candidates are exactly
`['X', '10']` higher-first, that the user's call overrides the computed value,
that a call for a non-candidate ring is ignored, that a miss offers no
candidates, and that moving a mark clears the call. What is unverified is
purely that those props reach the screen and render — the same gap §7 records
for every component.

### 9.5 Maestro

No Maestro flow was written for this feature. The flow would be almost
entirely `tapOn` against the system photo picker — a different app, outside
the flow's control, and reached only after a ~30 s OpenCV run. CLAUDE.md
already records this sandbox's emulator hitting `DEADLINE_EXCEEDED` on flows
~25 steps deep. Scripted `adb` taps plus screenshots were the more honest
tool here, and are what §9.1 reports. The existing `m3-entry.yaml` flow still
passes unchanged as part of the suite's regression surface.

## 10. Amendment — milsnabb via manual corners (`feat/milsnabb-photo-corners`)

> **Append-only amendment**, matching §10 of the spec it evidences.

### 10.1 Real-photo geometry verification — method and numbers

The auto-geometry path was verified against the 38-photo corpus in §9's
predecessor work; the milsnabb MANUAL path had no equivalent. Since
`shared/target-scoring` and `corners.ts` needed no code changes (§10.2/§10.4
of the spec amendment), this verification exercises the SHIPPED functions,
imported unmodified, against hand-picked pixel coordinates on 3 of the
corpus's milsnabb photos — not a reimplementation.

**Which photos, and why these three.** `docs/specs/cv-spike-report.md`'s
own photo table (line 41-43) already identifies 3 milsnabb photos out of
the 38-photo corpus by visual inspection:
`20260726_145316.jpg`, `20260726_150229.jpg`, `20260726_153751.jpg`. A
contact sheet of all 38 thumbnails was generated locally (not committed) to
sanity-check for a 4th; one candidate (`20260809_104014.jpg`) looked
plausible at thumbnail size but turned out, at full resolution, to be a
precision face (solid black through to near-center, no lighter annulus
middle) — a reminder of exactly the `guess_kind` misclassification risk
§0/§10.1 of the spec describe. The original 3 stand.

**Method, per photo:**

1. Pixel coordinates were read off a coordinate-grid overlay drawn in
   Python/Pillow over crops of the source photo (not eyeballed against the
   raw image) — gridlines at a 50-100px pitch, labelled in source-image
   pixel coordinates, iterated at increasing zoom until a ring's line
   crossing could be read to within a few pixels.
2. Four points on the target's **ring 9** boundary (top, right, bottom,
   left, in that order) were read this way and fed to `corners.ts`'s
   `homographyFromQuad`, mapped against ring 9's known radius (90 mm) —
   i.e. the exact same call `transformFromCorners` makes, just with ring 9
   substituted for the outermost ring (see below for why).
3. Independent validation points were then read on **ring 8** (a different
   ring, not used to build the homography) and mapped through the
   resulting homography via `applyHomography`. The residual is
   `|measured radius - 130mm|` (ring 8's true radius).

**Why ring 9, not the outermost ring (5).** All 3 photos are landscape
crops (~4000×1848 px) where the physical top and bottom of ring 5 (500 mm
diameter) fall outside the frame — confirmed by direct measurement, not
assumption: at the measured px/mm scale for each photo (see below), ring
5's pixel radius exceeds the available vertical margin from the target
center to the frame edge in all 3 cases. Ring 9 (180 mm diameter) is the
largest ring confirmed fully inside frame on all 3. This is a real product
finding, not just a test-methodology footnote — see spec §10.5.

**Results** (script: `residuals.mjs`, not committed — the coordinates below
are the complete input, so the numbers are reproducible without it):

| Photo                 | Validation point | Measured radius (mm) | True radius (mm) | Residual (mm) |
| --------------------- | ---------------- | -------------------: | ---------------: | ------------: |
| `20260726_153751.jpg` | ring8-left       |               141.16 |              130 |         11.16 |
| `20260726_153751.jpg` | ring8-right      |               134.88 |              130 |          4.88 |
| `20260726_153751.jpg` | ring8-top        |               104.02 |              130 |         25.98 |
| `20260726_153751.jpg` | ring8-bottom     |               142.01 |              130 |         12.01 |
| `20260726_145316.jpg` | ring8-left       |               141.22 |              130 |         11.22 |
| `20260726_145316.jpg` | ring8-right      |               124.55 |              130 |          5.45 |
| `20260726_150229.jpg` | ring8-left       |               136.38 |              130 |          6.38 |
| `20260726_150229.jpg` | ring8-right      |               136.92 |              130 |          6.92 |

Median residual **9.0 mm**, mean **10.5 mm**, range 4.9-26.0 mm over 8
validation points across 3 photos. No homography was degenerate.

**Reading the number honestly.** This is an order of magnitude worse than
the auto path's 0.51 mm median (§ of the phase 1 evidence, precision face,
well-behaved photos) — expected, for three compounding reasons, none of
which is a defect in `corners.ts` itself:

1. **Coordinate precision.** The four homography-building points were read
   off a static grid overlay by visual estimate, not placed by a finger
   with a live zoom loupe (which the shipped UI has — §10.3 of the spec —
   and this script does not). A few pixels of read error at this photo's
   scale (roughly 5-6 px/mm) is a fraction of a millimeter; tens of pixels,
   which is plausible for a "top" point near a frame edge, is several mm.
   `ring8-top` on `20260726_153751.jpg` (25.98 mm, the worst residual) is
   exactly that case — the point hardest to read precisely, closest to
   where the frame truncates the ring.
2. **Real perspective.** These photos were NOT shot square-on: independent
   axis measurements on the same ring in the same photo disagreed by up to
   ~7% (e.g. photo 1's ring 9 measured radius 482.5 px horizontally vs 520
   px vertically) — genuine camera-angle distortion, which is exactly what
   a 4-point projective homography is FOR (a single fitted ellipse cannot
   represent it at all; spec §0/`corners.ts` header comment). The residual
   partly reflects real geometric distortion the math is correctly
   resolving from only 4 points, not a math error.
3. **Concentric rings are not concentric in the image.** Under true
   perspective projection, circles that are concentric in the real world
   do not share a common center point in the photo. Measured directly:
   ring 8's apparent center on photo 1 sits ~115 px away from ring 9's
   apparent center. A homography built from ring 9 alone cannot know
   ring 8's independent center offset — it is not underfit, it is fitting
   the only 4 points it was given, correctly.

None of this contradicts the spec's approach; if anything it reinforces
§10.1's reasoning for going manual-only rather than trusting a fitted
ellipse (which assumes a single shared center and cannot represent this
kind of distortion at all).

### 10.2 What this does and does not verify

**Verified:** `homographyFromQuad` and `applyHomography` — the real,
unmodified functions the app calls — correctly solve a projective mapping
from 4 correspondences and produce geometrically sane, non-degenerate
results on real (imperfect, off-axis) photos, not just the synthetic
translation/scale/perspective fixtures in `corners.test.ts`.

**Not verified:** the on-device UI flow for milsnabb (§10.3 — pending the
Android build), and whether a REAL FINGER TAP with the loupe visible
achieves better precision than this script's static-grid read (plausible,
since the loupe gives live full-resolution zoom a static overlay does not,
but untested — no device-based tap-precision study was run).

### 10.3 Android emulator verification
