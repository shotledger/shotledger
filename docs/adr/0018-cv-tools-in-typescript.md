# ADR 0018: the CV tools are TypeScript, and the Python spike is retired

Status: proposed (2026-10-03)

## Context

Photo scoring began as a throwaway Python/OpenCV spike in `spike/cv/`
([`docs/specs/cv-spike-report.md`](../specs/cv-spike-report.md)). It outlived
the spike: about 4,200 lines became the reference the app's CV code was ported
from and pinned to, and the only way to measure that code on real photos. The
`gen_*_fixtures.py` scripts wrote the JSON fixtures the app's tests compare
against, and every corpus number in `docs/specs/` was taken with it.

That left two languages and two toolchains (a Python venv beside pnpm), and
measurements that ran the spike's code rather than the code that ships. The
two drift: the app's disc lock fits with `fitEllipse` because
react-native-fast-opencv has no `fitEllipseDirect`, and the parity run in
#502 found a real bug only by comparing them (#501). Issue #488 moved the
tools to TypeScript in four stages:

1. Node harnesses for the code already ported (close-up lock, hole proposals):
   #493, #497, #502.
2. The disc lock behind a `DiscOps` interface, run in Node on OpenCV.js: #502.
3. The labelling grids and both hole-model fits: #504.
4. The filter fit's input (`score_stages.py`), the fixture generators, and the
   retirement of the Python: this change.

Each stage reproduced the Python's numbers on the real corpus before the
Python it replaced was deleted; where it could not, the difference is
explained below.

## Decision

**TypeScript only.** The project has no Python outside the docs toolchain
(MkDocs) and the reqstool client. `spike/cv/` is deleted with its
`requirements.txt`; what remains is permanent tooling, so it moves to
`tools/cv/`: `eval/` runs the app's locks and hole proposals on real photos
(there is no second implementation left to be at parity with, only
measurement), `fit/` holds the labelling grids, the stage scoring and the
fits, and `fixtures/` the fixture generator. `tools/cv/README.md` says how to
run each.

**OpenCV.js 4.12 as a devDependency for Node** (`@techstark/opencv-js`,
decided on #488, pinned to the device's OpenCV version). The disc lock's
OpenCV calls go through `DiscOps`, which the device fills from
react-native-fast-opencv and Node from OpenCV.js, so a measurement runs the
code and the library the phone runs; the close-up lock and the hole proposals
run their pure-TypeScript operations in Node, as in a unit test. The tools'
own image work (the labelling grids, the stage scoring) also runs on
OpenCV.js. Nothing new ships to users.

**The fixtures are snapshots of the TypeScript.** `pnpm cv:fixtures` rewrites
`hole-features.fixtures.json`, `hole-proposals.fixtures.json` and
`closeup-lock.fixtures.json` from the TypeScript, on the same synthetic inputs
the Python used. Regenerated against the last Python-written files, every
input, count, checksum, candidate position and gate verdict came out
identical; only float values moved, within the tests' existing tolerances
(texture features by up to 9e-6 relative, `orient_entropy` on the synthetic
canvases by up to 7e-4, since the Python ran them in float32).

## Consequences

- **The independent second implementation is gone.** Until now a fixture
  proved that the TypeScript agreed with a separately written Python; it now
  proves only that the TypeScript agrees with its own past output. A wrong
  change that is regenerated into the fixture passes. What is left to catch
  it is review of the fixture diff and an `eval/` run on real photos before
  and after (`tools/cv/eval/diff.mts` compares two runs).
- **The app's disc lock is not the Python's**, and the corpus numbers in the
  specs were taken with the Python's. On 32 real photos (#502) the median
  radius gap between the two is 0.68 mm and 7 agree within 0.05 mm; gate
  verdicts differ on 2. The causes are real port differences, not noise:
  `fitEllipse` instead of `fitEllipseDirect`, no 7 px pre-blur and no in-frame
  point filter, and a radial profile sampled with `warpPolar` and a box
  high-pass whose profile score reads 30–950 lower. They show on cropped
  photos and close-ups, up to 23 mm at the 90th percentile. Whether to make
  the app's lock a faithful port is a separate decision.
- **The hole filter's fit is reproduced only on the Python's canvases.** Fed
  the canvases `score_stages.py` used, the TypeScript port of its stages
  gives the same candidates, labels and misses on all 31 marked photos, and
  `fit-hole-filter.mts` the same tables; the refitted tight-stage constants
  move by 0.3% or less, because the app's `holeFeatures` is float64 where
  OpenCV was float32.
  From the photos it does not, for two reasons. The hand marks of 2026-09-16
  were read off the Python's canvas, and on 3 photos with a clipped black
  zone the app's lock fits another ellipse, so in the tight stage 8 marked
  holes no longer meet a candidate. And OpenCV.js 4.12, the device's version, warps with cubic
  interpolation up to 4 grey levels off the 5.0 the Python ran (on about 5%
  of the canvas pixels; decoding and downscaling are identical), which moves
  a few borderline candidates. On the other 28 photos the tight stage finds
  194 candidates, 87 on holes, against the Python's 199 and 88, but about
  200 candidates are too few for a stable refit: some constants move by a
  factor of three while the tables stay close. The shipped constants are
  unchanged; refitting them means re-marking on the TypeScript's grids.
- **Measurements on OpenCV.js are slower** than on native OpenCV: the stage
  scoring's large-kernel morphology takes about 17 s a photo against the
  Python's 2.
- **Not ported**, recoverable from git history: the spike's own pipeline
  (`target_cv.py`, `run_spike.py`, `eval_corpus.py`), the gate calibration
  harness (`validity_gate.py`; `disc.eval.ts` reports the same metrics from
  the app's lock), `eval_closeup.py`'s synthetic close-ups cut from whole
  photos, and the close-up lock's milsnabb ring model with
  `eval_milsnabb.py`, which was never in the app.
- The specs under `docs/specs/` keep their history: each that names the
  Python carries a one-line note pointing at `tools/cv/`.
