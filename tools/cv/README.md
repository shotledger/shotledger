# CV tools

TypeScript tools for the app's photo-scoring CV: they run the app's own locks
and hole proposals on real photos, render the grids holes are marked on, fit
the hole models, and write the lock-step fixtures. They began as the Python
spike in `spike/cv/`, which [ADR 0018](../../docs/adr/0018-cv-tools-in-typescript.md)
retired.

Everything runs from the repo root on Node. OpenCV calls go through OpenCV.js
4.12 (`@techstark/opencv-js`, a root devDependency pinned to the device's
OpenCV), so a measurement runs the code and the library the phone runs.
ImageMagick (`magick`) decodes the photos. None of this is in `pnpm check`:
apart from the fixtures, the tools read photos that are not in the repo.

## The stages they measure

In the order `scan.tsx` runs them:

| Stage                              | App                                                                                        | Measurement                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Disc lock: fit the black, rectify  | `app/src/features/photo-scoring/disc-lock.ts` (ops: `opencv.ts`)                           | `docs/specs/cv-corpus-validation-2026-09.md`    |
| Close-up lock, and which lock wins | `app/src/features/photo-scoring/closeup-lock.ts`                                           | `docs/specs/cv-closeup-lock-2026-09.md`         |
| Milsnabb guards on the close-up    | `app/src/features/photo-scoring/precision-guards.ts`                                       | `docs/specs/cv-closeup-lock-2026-09.md`         |
| Suggested holes                    | `app/src/features/photo-scoring/hole-proposals.ts`                                         | `docs/specs/cv-hole-proposals-2026-09.md`       |
| Tap snap and the hole/patch filter | `app/src/features/photo-scoring/tap-snap.ts`, `shared/src/target-scoring/hole-features.ts` | `docs/specs/cv-corpus-validation-2026-09.md` §5 |

Scoring itself (the SHB edge rule) is `shared/src/target-scoring/score.ts`.
The user-facing account of the whole pipeline is
`docs/manual/explanation/how-holes-are-found.md`.

## Photos are not in the repo

Target photos, canvases, grids, marks and every output that names a photo are
personal data (hard rule 7). Keep them outside the working tree, e.g. under
`~/tmp/`.

## Layout and how to run

| Path               | What it holds                                                                 |
| ------------------ | ----------------------------------------------------------------------------- |
| `eval/`            | The app's disc lock, close-up lock and hole proposals on real photos          |
| `fit/`             | Labelling grids, the proposal stages scored against marks, the two model fits |
| `fixtures/`        | The generator of the three CV lock-step fixtures                              |
| `py-format.ts`     | Python's number formatting, so outputs keep the format the spike's files had  |
| `vitest.config.ts` | The runner for every `*.eval.ts`, `*.tool.ts` and `*.check.ts` here           |

A `.mts` file is plain TypeScript run by Node: `node tools/cv/fit/<file>.mts`.
Everything that imports app code runs under vitest, configured by environment
variables, and skips itself when they are unset:

```bash
CV_...=... pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts <file>
```

`--silent=false` shows the per-photo lines, which vitest otherwise hides.

## `eval/`: the app's CV on real photos

Each tool writes one JSON line per photo. `diff.mts` compares two runs of the
same tool, a baseline and a candidate, and exits non-zero where they disagree:
a lock on one side only, a different gate verdict, rings more than 0.05 mm
apart, a candidate or proposal on one side only, or a value past the
lock-step fixture's tolerances.

```bash
# photos -> 2048 px greyscale PGMs, decoded once
tools/cv/eval/prep.sh <pgm-dir> <photos>...

# the close-up lock: its mapping, its gate's numbers and verdict
CV_EVAL_IN=<pgm-dir> CV_EVAL_OUT=closeup.jsonl \
    pnpm exec vitest run -c tools/cv/vitest.config.ts closeup.eval
node tools/cv/eval/diff.mts closeup base.jsonl closeup.jsonl

# the disc lock: its mapping, canvas, validity metrics and verdict
CV_EVAL_IN=<pgm-dir> CV_DISC_OUT=disc.jsonl \
    pnpm exec vitest run -c tools/cv/vitest.config.ts disc.eval
node tools/cv/eval/diff.mts disc base.jsonl disc.jsonl [--key canvasToMm]

# both locks per photo, chooseLock's pick, the close-up's scale against the
# disc lock's, and the disc lock's ring drift (its gate's scale check)
CV_EVAL_IN=<pgm-dir> CV_REAL_OUT=real.jsonl \
    pnpm exec vitest run -c tools/cv/vitest.config.ts closeup-real

# the milsnabb lock on milsnabb photos and crops, and on precision photos
# (negatives); the set file is a TSV of pgm path, set, framing, face
CV_MIL_SETS=sets.tsv CV_MIL_OUT=milsnabb.jsonl [CV_MIL_SHARD=i/n] [CV_MIL_CROPS=1] \
    pnpm exec vitest run -c tools/cv/vitest.config.ts milsnabb.eval

# the precision close-up lock's three milsnabb guards (precision-guards.ts) and
# the X-line reading behind the face question (`asks`), on the same sets and
# crops (crops.ts), with chooseLock's pick against the disc lock; `msGuard` is
# the hole-size check as the app runs it, `reused` whether the suggestions from
# its candidates match a fresh run; several seconds per image the close-up lock
# passes, so shard it
CV_GUARD_SETS=sets.tsv CV_GUARD_OUT=guards.jsonl [CV_GUARD_SHARD=i/n] [CV_GUARD_CROPS=1] \
    [CV_GUARD_DUMP=<dir>] pnpm exec vitest run -c tools/cv/vitest.config.ts guards.eval
```

The hole proposals run on the rectified canvas the app hands them.
`holes-prep.tool.ts` writes it per photo as a PGM plus a JSON sidecar
(centre, scale, face), from the disc lock or, with `CV_PREP_LOCK=closeup`,
the close-up lock, or with `CV_PREP_LOCK=milsnabb` the milsnabb lock, whose
sidecar carries the milsnabb face (the app does not offer hole suggestions on
that face, so this measures what they would do). `score-holes.tool.ts` measures a run against hand marks
(below) with the shipped constants, on the photos they were fitted on;
`CV_SCORE_CSV` also writes the labelled candidates for the proposal fit.

```bash
CV_PREP_IN=<photos> CV_PREP_OUT=<canvas-dir> [CV_PREP_LOCK=closeup|milsnabb] [CV_PREP_ONLY=names.txt] \
    pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts holes-prep
CV_EVAL_IN=<canvas-dir> CV_EVAL_OUT=holes.jsonl \
    pnpm exec vitest run -c tools/cv/vitest.config.ts holes.eval
CV_SCORE_RUN=holes.jsonl CV_SCORE_MARKS=marks.txt [CV_SCORE_CSV=candidates.csv] \
    pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts score-holes
node tools/cv/eval/diff.mts holes base.jsonl holes.jsonl
```

## `fit/`: hand marks and the two hole models

Ground truth is **hole centres, not candidate labels**: labelling the
candidates a detector proposes cannot measure the holes it misses.

**1. Mark the holes.** `mark-holes.tool.ts` renders each photo's canvas under
a labelled grid (a 50 px grid, every 100 px intersection labelled in tens of
px). Read the hole centres off by eye into a marks file, one line per photo:
`<name> x,y x,y ...`. The canvas is the disc lock's 1040 px square round the
black zone (`label-canvas.ts`), or with `CV_MARK_LOCK=closeup` the close-up
lock's canvas, cropped to what the photo shows, or with `CV_MARK_LOCK=milsnabb`
the same from the milsnabb lock. A JSON sidecar beside each PNG
holds the image px -> label px matrix, which carries a mark to another canvas
through the photo.

```bash
CV_MARK_IN=<photos> CV_MARK_OUT=<grids> [CV_MARK_ONLY=names.txt] [CV_MARK_LOCK=closeup|milsnabb] \
    pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts mark-holes
```

**Pre-labelling.** With `CV_MARK_PRELABEL=<threshold>` the tool also runs the
app's hole proposals (`hole-proposals.ts`, shipped constants) at that
threshold on the canvas the app would hand them, under the same lock, and
starts every photo that has no line in `CV_MARK_MARKS` from them. Correct the
pre-labels rather than marking from scratch.

```bash
CV_MARK_IN=<photos> CV_MARK_OUT=<grids> [CV_MARK_LOCK=closeup|milsnabb] \
CV_MARK_PRELABEL=0.3 CV_MARK_MARKS=marks.txt \
    pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts mark-holes
```

- Each pre-labelled photo gets a line appended to the marks file, starting
  with `?`: `?<name> x,y x,y ...`. Every reader of a marks file
  (`score-holes`, `score-stages`, `fit-hole-proposals`) skips a `?` line, so a
  pre-label never counts as ground truth. Move, add and delete marks on the
  line, then delete the `?`: that confirms it.
- A photo with any line, confirmed or `?`, is never pre-labelled again, and
  the tool only appends: existing lines are never rewritten.
- The grid rings each pre-label in cyan at hole size, numbered in its line's
  order; the sidecar keeps the threshold and each mark's probability.
- Check positions, not only presence. On 11 hand-marked precision photos, 0.3
  found 78% of the holes at 2.1 false positives a photo, and a found hole's
  pre-label sat 1.2 mm from its mark at the median but more than 4 mm off on
  one in ten (touching holes, holes on a white line).
- The classifier was fitted on precision photos; on milsnabb it finds about a
  third of the holes (2026-10-05), so expect to mark most of them there.
- `marks.check.ts` pins the `?` rule; `prelabel.check.ts`, on synthetic
  photos, that a pre-label lands on its hole of the grid under the disc and
  milsnabb locks.

A mark belongs to the canvas it was read off. The marks of 2026-09-16 were
read off the Python spike's canvas, which on 28 of the 31 photos sits within
0.4 px median of this one; on three photos with a clipped black zone the two
ellipse fits differ and the old marks do not fit this canvas.

**2. The hole/patch filter** (`HOLE_FILTER_WEIGHTS` in
`shared/src/target-scoring/hole-features.ts`). `score-stages.tool.ts` runs the
three proposal stages the filter was measured behind (`hole-stages.ts`: the
phase-1 `tight` stage it ships behind, and the rejected `loose` and `open`;
none of them is the app's detector) and writes every candidate's label and
texture features. `fit-hole-filter.mts` fits the logistic regression,
cross-validated by photo, then on everything; `--test` corpora are never
fitted on. Numbers:
[`docs/specs/cv-corpus-validation-2026-09.md`](../../docs/specs/cv-corpus-validation-2026-09.md)
§5.

```bash
CV_SCORE_MARKS=marks.txt CV_SCORE_IN=<photos> CV_SCORE_OUT=stages.csv \
    pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts score-stages
node tools/cv/fit/fit-hole-filter.mts --stage tight stages.csv
node tools/cv/fit/fit-hole-filter.mts --stage tight a.csv --test b.csv
```

The stages run large-kernel morphology, which OpenCV.js does single-threaded:
about 17 s a photo. On the 2026-09-16 marks the hole filter's fit
reproduces the shipped table only on the spike's own canvases; ADR 0018
says why.

**3. The hole proposals** (`HOLE_PROPOSAL_WEIGHTS` in
`app/src/features/photo-scoring/hole-proposals.ts`). The candidates come from
`score-holes.tool.ts` above (`CV_SCORE_CSV`); `fit-hole-proposals.mts` fits
them the same way. Numbers:
[`docs/specs/cv-hole-proposals-2026-09.md`](../../docs/specs/cv-hole-proposals-2026-09.md).

```bash
node tools/cv/fit/fit-hole-proposals.mts candidates.csv --marks marks.txt
node tools/cv/fit/fit-hole-proposals.mts a.csv --test b.csv --marks marks.txt
```

Both fits split photos into folds with numpy's `default_rng`, reimplemented in
`numpy-random.mts`, so they reproduce the folds the spike's fits drew;
`fit.check.ts` pins it and the estimator:
`pnpm exec vitest run -c tools/cv/vitest.config.ts fit.check`.

## `fixtures/`: the lock-step fixtures

```bash
pnpm cv:fixtures
```

rewrites `hole-features.fixtures.json`, `hole-proposals.fixtures.json` and
`closeup-lock.fixtures.json` from the TypeScript, on synthetic crops and
canvases only. They are **snapshots**: they pin the TypeScript to its own past
output, not to an independent implementation (ADR 0018). Regenerate after a
deliberate change to the CV code, and review the diff together with an `eval/`
run on real photos before and after.

## What the Python had that this does not

Retired with the spike and not ported, recoverable from git history
(`git log -- spike/cv`):

- the spike's own pipeline (`target_cv.py`, `run_spike.py`, `eval_corpus.py`):
  its disc lock, hole detector and scorer. The app's locks replaced it.
- `validity_gate.py`, which calibrated the gate; `disc.eval.ts` reports the
  same metrics and verdict from the app's lock.
- `eval_closeup.py`, close-ups cut synthetically from whole photos;
  `closeup-real.eval.ts` covers real photos.
- the milsnabb ring model of the close-up lock and `eval_milsnabb.py`. The
  app's own milsnabb lock (`milsnabb-lock.ts`) replaced them, measured by
  `milsnabb.eval.ts`.
