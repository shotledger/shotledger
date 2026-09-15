# A second shooter's photos, measured (2026-09-15)

The first corpus from someone other than the maintainer. It answers a question
the earlier measurements could not: **does the pipeline hold up on another
shooter's targets, phone and club?**

Read with [`cv-spike-report.md`](cv-spike-report.md) (the original 36/38-photo
spike) and [`cv-corpus-validation-2026-09.md`](cv-corpus-validation-2026-09.md)
(147 of the maintainer's own photos, and the seven-feature hole/patch filter
that corrected the spike's "no classical feature separates patches" claim).

- **Photos are personal data** (hard rule 7). They live outside the working
  tree, in `~/agents/shotledger/target-corpus/`, alongside a `CORPUS.md` that
  records provenance and consent status. Nothing derived from them — no image,
  no crop, no thumbnail — is in this repository.
- **Consent for training use is not recorded.** The measurement below needed
  only the one-off look that was given. Hand-labelling, patch-crop
  augmentation, or holding these photos in a training set does not, and must
  wait on an agreement in writing. See #264.

## What arrived, and what was removed

118 files. **20 were not targets at all, and 15 of those were personal data** —
logbook pages carrying a name and a personal identity number, a weapons
register page with serial numbers, result lists photographed off a screen, and
four selfies — plus 21 result-list PDFs. All were deleted on the maintainer's
instruction, along with every derivative the measurement had rendered from
them. The source zip outside the tree is the remaining copy.

The lesson worth keeping: **a contributed photo folder is not a photo folder.**
Anything that walks one — a labelling pass, a training run, an upload — will
sweep up documents mixed in among the targets. Triage before processing.

| Class                                                                 | Count  |
| --------------------------------------------------------------------- | ------ |
| 25 m precision face (F.7.1), usable                                   | **68** |
| Other faces (6 grey military-type, 3 pasted black faces on cardboard) | 9      |
| Milsnabb (J.7.1)                                                      | **0**  |

Conditions in the 68: one phone, one club, **all outdoors**, 13 with a hard
shadow across the card; **~60 heavily pasted**, ~11 lightly patched, **1
clean**; ~60 are a small card stapled over a larger printed target ("nested
faces"); 55 close-ups clipping the outer rings; 54 within ~12° of frontal.
Fresh holes counted by eye: **329**, nearly all in the black, ~8 in the white.

## Measured (spike pipeline unchanged: 2048 px, `v1`, auto face type)

**Geometry:** 54/68 locked (79%); 55/68 (81%) when the face is forced, as the
app does. **12 of the 14 failures share one cause** — a landscape frame with a
wooden post or wall on the right, where "largest dark blob" picks that instead
of the card. The production validity gate rejects all 13 real failures (axis
ratio 3.2–408 against a threshold of 2.0) and passes every lock, so the app
would refuse rather than mis-score. Inner-ring residual on locked photos:
median 1.27 mm, worse than the spike's 0.51 mm, inflated by the nested outer
target's rings competing in the refine stage.

**Holes**, same definitions as the spike:

| Subset             | Photos | Holes | TP  | FP  | Recall  | Precision | FP/photo |
| ------------------ | ------ | ----- | --- | --- | ------- | --------- | -------- |
| All precision-face | 68     | 329   | 167 | 369 | **51%** | **31%**   | 5.4      |
| Geometry locked    | 55     | 266   | 167 | 248 | **63%** | **40%**   | 4.5      |

Against the spike's 36%/43% overall and 59%/61% on its locked precision subset:
**recall holds on 7× the holes; precision is lower**, because these targets are
denser with patches and the nested outer target adds paper-zone false
positives. **Zero photos produced an exact series.** Seven found every hole,
each with false positives.

## What this changes, and what it does not

- **It corroborates the standing conclusion.** Classical detection is not
  shippable as automatic. That now holds across two shooters, two phones and
  two clubs, not one.
- **It does not invalidate the seven-feature filter.** That filter was fitted
  on the maintainer's corpus (84% recall / 84% precision at threshold 0.5; 51%
  / 95% at 0.8) and has **not** been re-fitted or re-measured here. Doing so on
  a second shooter's photos is the obvious next measurement, and the one that
  would tell us whether the filter generalises or was tuned to one club's
  paper.
- **It names the single highest-value fix**: the face-finding prior. Replacing
  "largest dark blob" with one that requires a disc-like ellipse is one
  function, and would address 12 of the 14 geometry failures (estimated lock
  rate ~95%).
- **Milsnabb remains unmeasured on anyone's photos but the maintainer's** — 0
  of 68 here. Any claim about J.7.1 rests on the 15 photos in the 147-photo
  set.

## Reproducing

The spike venv and scripts run unchanged (OpenCV 5.0.0, ~1 s/photo). Output,
including the per-file triage, is under `~/tmp/shotledger-cv-spike/` — scratch,
regenerable, and not the master copy of anything.
