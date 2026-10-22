# Hole proposals without a learned model (2026-09-22)

> **2026-10-03:** the Python in `spike/cv/` is retired; the CV tools are TypeScript in [`tools/cv/`](../../tools/cv/README.md) (ADR 0018). The record below is as written.

How good can hole detection get on the rectified canvas with classical image
processing and fitted constants only — no neural network, no inference
runtime, no new dependency? This is the measurement behind the "suggested
holes" stage (`spike/cv/hole_proposals.py`, ported to
`app/src/features/photo-scoring/hole-proposals.ts`) and the answer to that
question for #264 and #347.

- **Corpus**: the same 31 hand-marked photos as
  [`cv-corpus-validation-2026-09.md`](cv-corpus-validation-2026-09.md) §5 —
  20 contributed, 11 the maintainer's — rectified onto the app-sized canvas
  (2 x 262.5 mm at 4 px/mm, so the outer white zone the app searches is
  measured too). Photos, marks and every derived image stay outside the
  working tree (hard rule 7); this file holds counts and conclusions.
- **Labels**: `marks-v2-2026-09-22.txt`, 152 holes. See §1.
- **Matching**: a candidate is a true positive within 0.9 hole diameters of
  an unclaimed mark, nearest first; accepted candidates closer than one
  diameter are merged before counting, as the stage does.
- **Cross-validation**: 5-fold, split by photo, seed 0.

## 0. Headline

| Stage                                            |    Recall | Precision | FP/photo | Exact series |
| ------------------------------------------------ | --------: | --------: | -------: | -----------: |
| Shipped `tight` stage + hole/patch filter (#283) |     59.2% |     89.7% |     0.32 |         3/31 |
| **LoG proposals + 30-feature logistic, thr 0.7** | **74.3%** | **91.9%** | **0.32** |    **10/31** |
| same, thr 0.5                                    |     75.0% |     88.4% |     0.48 |         9/31 |
| same, thr 0.3                                    |     79.6% |     81.8% |     0.87 |         8/31 |
| Proposal stage alone (before the classifier)     |     92.8% |      2.7% |      162 |            — |

At the same false-positive rate the shipped stage had, recall goes from 59%
to 74% and the number of series that come out exactly right goes from 3 to
10 of 31. The bar for "Auto Score" (≥95% recall, ≤1 FP per target) is not
reached and this route does not reach it: the remaining misses are not
threshold effects (§4).

**Answer to "how good can it be":** about three holes in four found, one
suggestion in ten wrong, one series in three exactly right. Beyond that the
next step is data, not cleverness — see §6.

## 1. The labels were the first problem

Every unmatched candidate the new classifier scored above 0.3 was rendered
at 4x with the hand marks drawn on and reviewed by eye (31 cases). Nine of
the thirteen scored above 0.6 were **real holes the 2026-09-16 labels had
missed**: second holes in clusters of touching holes on three photos, a
white-zone hole at the card edge, and one mark placed on a hole's rim rather
than its centre. The labels undercount clustered holes systematically — the
2026-09-15 count already noted 5 missing — so every earlier precision figure
was understated and every recall figure flattered.

Corrections (five holes added, one moved): `marks-v2-2026-09-22.txt`, 152
holes, with the review recorded in the labels README. The review was
detector-guided, so it corrects what the detector found, not what both
missed; §4's misses are the residue.

The remaining four high-scoring false positives were a printed "8", a patch
corner, torn paper next to a hole, and nothing visible (a dark smudge).

## 2. What changed in the stage

Three things, each measured on its own.

**Proposal stage: Laplacian of Gaussian peaks instead of thresholded blobs.**
The shipped `tight` stage proposes 7 candidates per photo and finds 65% of
the holes; nothing downstream can recover a hole it never proposed. A
Laplacian-of-Gaussian response at the hole scale (σ = d/2√2 on a 2 px/mm
canvas, 4-neighbour Laplacian, normalised by the scoring area's median
absolute deviation), with local maxima above 8 MADs as candidates, proposes
~160 per photo and finds **93%** — the ceiling moved from 65% to 93%. The
loosened blob stage #283 rejected proposed three times as much and found
_fewer_; the difference is that a LoG peak is at the centre of a blob, not on
its rim, so a printed digit yields a handful of peaks rather than saturating a
cap with fragments. Threshold 6 MADs was also measured: 70% more candidates,
identical end-to-end result. 8 stays.

**Classifier: 30 features instead of 6.** The six texture features of the
shipped filter (`hole_filter.features`), plus: where the candidate sits on
the face (black zone, distance to the nearest ring line, radius), the LoG
value at three scales and their ratio, a five-bin radial profile relative to
the local paper level (raw and normalised), the shape of the blob under the
candidate at half its own contrast (area in hole units, fill of its bounding
circle, elongation, whether it runs out of the window), how straight its
edges are (energy in the two dominant orientation bins), and the extent of
the printed structure it belongs to with the ring lines removed — the `tight`
stage's decisive digit test, made a feature. Logistic regression, same
estimator as #283. AUC by photo: 0.989.

| Classifier behind the LoG stage     |   AUC | Recall @ 0.32 FP/photo |
| ----------------------------------- | ----: | ---------------------: |
| 6 texture features                  | 0.986 |                   ~62% |
| 30 features                         | 0.989 |                **74%** |
| 30 features, gradient-boosted trees | 0.992 |                   ~79% |

The trees were **not** shipped (§5).

**Merge and refine.** Two peaks on one torn hole were a systematic false
positive; accepted candidates closer than one hole diameter are now one
proposal. Each proposal's centre is then moved to the centroid of its
deviation from the paper within 0.6 d (two iterations).

## 3. Centre accuracy — the v2 accuracy bar (#347)

The hand marks are not precise enough to measure this: read off a 50 px grid,
they sit a median **2.0 mm** from the hole centres. So 21 holes across 21
photos were re-read from 6x crops under a 5 px grid, to ~0.1 mm:

| Centre estimate            |  Median |     p90 |   Worst |
| -------------------------- | ------: | ------: | ------: |
| LoG peak                   | 0.50 mm | 1.06 mm | 1.77 mm |
| Refined centroid (shipped) | 0.64 mm | 0.84 mm | 1.53 mm |
| 2026-09-16 hand mark       | 2.02 mm | 3.13 mm | 3.82 mm |

The refinement trades a little median for a shorter tail; the worst case is a
torn, oversized hole where the peak sat on one lobe. This is the stage's own
error on top of the geometry's ~0.5 mm ring residual, so a suggested mark is
typically within a millimetre of the true centre — inside the 1 mm band the
edge-call rule already asks the shooter to decide. TargetScan's advertised
0.2–0.5 mm is not matched by the detector alone; a nudge in the loupe is.

## 4. What is still missed, and why

Of 152 holes, the stage itself misses 11 (7%): three dark-on-black holes
with a faint blue rim on one night photo (below 8 MADs), a cluster where
three holes overlap and produce one peak, and one hole whose earlier label
sat on its rim. The classifier then rejects a further ~28 at threshold 0.7:
torn holes overlapping a ring line or a printed digit, clean-cut holes with a
smooth rim that read as patch-like, the two white-zone holes, and holes on
the darkest, most heavily pasted cards.

None of these is a threshold away. The white zone is evidenced by six holes
in 152; touching holes need a shape model, not a peak; the pasted cards need
examples of exactly that texture. Every one is a **data** gap.

## 5. Things tried that do not ship

- **Gradient-boosted trees** (150 trees, depth 3): +5 points recall
  in-corpus at the same FP rate, but cross-shooter (fit on one corpus, test on
  the other) they were _worse_ than the logistic in one direction and better
  in the other. ~1000 constants against 31, no demonstrated generalisation
  gain, so the logistic ships. The trees are the first thing to retry when the
  corpus passes a few hundred photos.
- **The before/after diff** (#264's "strongest step"). Same-card series pairs
  were found in the corpus (the geometry aligns two photos of one card to
  within 0.4 px without any registration; correlation 0.92–0.96 after a
  translation fit). The signed, illumination-flattened difference finds
  **35 of 35** new holes on 8 pairs — and 28–95 false positives per photo,
  because paper grain and pasted patches differ between photos too. As an
  extra feature for the classifier it changed nothing (AUC 0.998 with and
  without on those 8 photos). Patches are already handled by the classifier,
  so the diff's one structural advantage buys nothing measurable. Measured
  negative; not built.
- **Loosening the LoG threshold** to 6 MADs: no change (above).
- **A normalised-cross-correlation disc template** as the proposal stage:
  recall 95% raw but 400 candidates per photo and a worse classifier operating
  point than LoG at every threshold.

## 6. Cross-shooter generalisation

| Fitted on        | Tested on        | Recall | Precision | FP/photo |
| ---------------- | ---------------- | -----: | --------: | -------: |
| contributed (20) | maintainer (11)  |  75.9% |     93.2% |     0.27 |
| maintainer (11)  | contributed (20) |  64.3% |     61.2% |     2.00 |

The same asymmetry as #283: a fit on the maintainer's 11 cleaner photos has
never seen the contributed corpus's patch-heavy cards and mis-calibrates on
them; the reverse holds at the pooled operating point. The shipped constants
are fitted on both. For a third shooter the honest expectation is between
these rows, and the way to narrow it is the training-data opt-in that already
exists in Settings — every kept, nudged or deleted suggestion is now recorded
with a `suggested` flag, which is exactly the label a re-fit needs.

## 7. Cost on the phone

The stage runs on the `RectifiedCanvas` the geometry stage already holds. In
Node the pure-JS maps take ~1.5 s on a 2100 px canvas, but under Hermes on the
emulator they took about **two minutes** — the estimate of 5–8 s was wrong by
an order of magnitude. So the three whole-canvas operations (the 2x2
downsample, blur-plus-Laplacian and the box maximum) go to OpenCV on a device
(`hole-proposals-native.ts`); everything else stays in JS on both paths, and
the per-candidate features run in yielding batches so the marking screen keeps
painting and taking taps. The pure path remains the reference the lock-step
fixture pins.

Measured on the emulator after the change: geometry plus suggestions in about
15 s end to end on the software-rendered AVD, with the marking screen painted
and animating throughout. An on-device self-test compared each OpenCV
operation with the pure one on the same image: identical to 3e-13.

**Two guards came out of driving it on the device.** A rendered, grain-free
test target made the stage propose 585 holes: its fine-scale MAD was ~150x
below the lowest real photo's, so every printed ring line scored as a
certain hole. The MADs now have floors just under the corpus minimum (s1
0.05, s2 0.02, s05 0.08), which changes nothing on the 31 real photos —
identical recall, precision, false positives and fitted constants — and cut
that image to 25 proposals. And the screen now suggests nothing when the
stage proposes more than twice the series length plus two, saying so,
because a photo the detector does not understand should not be covered in
marks to delete. Both are about images unlike the corpus; neither was needed
by any real photo.

Another change to the reference came with it: the LoG maps are normalised by the
MAD of every 4th pixel in each direction instead of every pixel, which keeps
the two exact medians affordable. Re-measured and re-fitted: identical at the
shipped threshold (74.3% / 91.9% / 0.32 / 10 exact), within one hole or one
false positive at the others.

## 8. Limits

- 31 photos, 152 holes, two shooters, two phones, two clubs, one caliber,
  outdoors and indoors — the same corpus as before, with corrected labels.
- The label review was detector-guided (§1).
- Centre accuracy rests on 21 holes read by eye at 6x.
- Zero centrefire holes; six white-zone holes.
- The Python twin is what was measured; the TypeScript is pinned to it by the
  synthetic lock-step fixture, not by having been run on the corpus.
