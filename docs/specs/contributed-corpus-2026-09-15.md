# A second shooter's photos, measured (2026-09-15)

The first corpus from someone other than the maintainer. It answers a question
the earlier measurements could not: **does the pipeline hold up on another
shooter's targets, phone and club?**

Read with [`cv-spike-report.md`](cv-spike-report.md) (the original 36/38-photo
spike) and [`cv-corpus-validation-2026-09.md`](cv-corpus-validation-2026-09.md)
(147 of the maintainer's own photos, and the seven-feature hole/patch filter
that corrected the spike's "no classical feature separates patches" claim).

- **Photos are personal data** (hard rule 7). They live outside the working
  tree, in `~/no_cloud/shotledger/target-corpus/`, alongside a `CORPUS.md` that
  records provenance and consent status. Nothing derived from them — no image,
  no crop, no thumbnail — is in this repository.
- **Consent for training use was not recorded when this was written.** It is,
  since **2026-09-16**: in writing, held by the maintainer, covering
  hand-labelling, patch crops and a training set. The measurement below needed
  only the one-off look that was given anyway. See #264.

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
| Other faces (6 gray military-type, 3 pasted black faces on cardboard) | 9      |
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
  would tell us whether the filter generalizes or was tuned to one club's
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

---

## Face prior, measured (2026-09-16)

The section above _predicted_ ~95% from the disc-like face prior. #266 shipped
the prior to `app/src/features/photo-scoring/face-candidate.ts` on unit tests
alone and said so plainly: "the predicted lock-rate improvement is NOT
verified". This is that verification, replayed through the Python twin
(`spike/cv/target_cv.py`, `--prior on|off`) over both corpora.

"Locked" here is **the production gate's own verdict**, not an eye judgement:
`target_cv.check_geometry_validity` mirrors
`app/src/features/photo-scoring/validity.ts` and its metrics mirror
`runGeometry` in `opencv.ts`, so a row reads "would the app have accepted this
photo", not "did the pipeline produce a fit". Face type is forced to
precision, as the app does.

| Corpus                         | Photos | Prior off |     Prior on |
| ------------------------------ | -----: | --------: | -----------: |
| Contributed (second shooter)   |     68 |  55 (81%) | **66 (97%)** |
| Maintainer (spike working set) |     38 |  23 (61%) | **25 (66%)** |

The predicted ~95% on the contributed corpus lands at **97%**.

### The 14 known failures, one by one

Cross-referenced against the by-eye `L`/`F` judgement the section above was
built from (held outside the tree with the photos):

- **12 of the 14 are fixed**, and all 12 were re-checked by eye on the
  rendered panels: the drawn rings sit on the printed lines. The prior does
  not merely get them past the gate.
- **2 remain rejected, and both should be.** One is a motion-blurred frame
  with no target visible in it at all; the other is a near-grazing shot of a
  different, non-precision face. `axisRatio` catches both.
- All 54 photos the eye called locked pass the gate under both settings, so
  nothing regressed.
- Worst fitted-ellipse aspect across the corpus falls from **429 to 81**, and
  the count above the gate's 2.0 threshold from **13 to 2**.

On the maintainer's 38 the prior fixes exactly the two failures
`cv-spike-report.md` §6.3 named as "largest dark blob is the background" — a
treeline and a gravel bank — and, separately, **starts rejecting** one of the
two extreme-perspective photos that §6.1 excluded by hand: it used to pass the
gate on a lock onto blurred background, and now fails `axisRatio`. That is the
gate getting _more_ honest, not less. The remaining 13 rejections on that set
are dominated by its 10 milsnabb faces, which phase 1 does not support and
which are being scored here as precision faces, so 66% is a floor for a
mixed-face set rather than a precision-face rate.

### Geometry accuracy did not pay for the lock rate

Worst inner-ring residual over the photos each setting accepts:

| Corpus      | Prior off (median / max) | Prior on (median / max) |
| ----------- | -----------------------: | ----------------------: |
| Contributed |        1.30 mm / 3.24 mm |   **1.04 mm** / 3.24 mm |
| Maintainer  |        1.62 mm / 2.93 mm |       1.62 mm / 3.22 mm |

Eleven extra photos join the contributed set and the median residual _falls_,
because the photos the prior rescues are frontal close-ups whose rings fit
well — the failure was never the fit, it was which blob was fitted.

### Limits

- Still the Python twin, not the shipped TypeScript, which cannot run
  headlessly. It exercises the same arithmetic (`pick_face_candidate` mirrors
  `pickFaceCandidate` constant for constant), not the same code.
- No hole-detection number changes here. The prior moves geometry only; the
  51% / 31% hole figures above stand unrevised.
- The "correct lock" re-check is the author's, by eye, on rendered panels —
  the same method and the same limitation as the original counts.

Reproduce (photos and output stay outside the tree):

```bash
spike/cv/eval_corpus.py --in <photos> --out <dir> --kind precision --prior on|off
```
