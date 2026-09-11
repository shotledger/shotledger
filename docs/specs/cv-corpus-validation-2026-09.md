# CV validation on a 147-photo corpus (2026-09-11)

Two measurements on the maintainer's own target photos, four times the
corpus the original spike had. One corroborates
[`cv-spike-report.md`](cv-spike-report.md); the other **corrects a
load-bearing claim in it**.

- **Corpus**: 147 distinct photos (182 supplied, 35 duplicates removed by
  content hash), 4000x1848, phone camera, indoor and outdoor, fresh and
  heavily pasted, mostly SPSF 25 m precision with some milsnabb.
- **Photos are personal data** (hard rule 7). They were read from outside
  the working tree and **nothing derived from them — no image, no crop, no
  annotated output — is in this repo.** This file holds counts and
  conclusions only.
- **What ran**: the Python spike (`spike/cv-target-scoring`,
  `spike/cv/run_spike.py`) at `--long-side 2048`, under
  `opencv-python-headless` 5.0.0.93 / numpy 2.5.2. The shipped
  `runGeometry` binds `react-native-fast-opencv` and cannot run headlessly,
  so **this exercises the algorithm the app is a port of, not the shipped
  TypeScript.**

---

## 1. Geometry sweep — corroborates the spike

147 photos, **0 exceptions**, median 1.0 s each (desktop CPU, not a phone).
The geometry stage is as robust as the spike claimed.

|                                      |   n | median holes found | found nothing |
| ------------------------------------ | --: | -----------------: | ------------: |
| black zone fully in frame            |  47 |                  5 |    **0 (0%)** |
| black zone clipped by the frame edge | 100 |                  4 |  **16 (16%)** |

**68% of real photos clip the printed black zone** — which is the geometry
anchor (`referenceDiameterMm`). Note this measures the _black zone_
touching the frame edge, not the outermost scoring ring, which is cropped
more often still.

| target type (per `guess_kind`) |   n | median holes | found nothing |
| ------------------------------ | --: | -----------: | ------------: |
| precision                      | 132 |            4 |        7 (5%) |
| milsnabb                       |  15 |        **0** |   **9 (60%)** |

Two consequences, both already acted on:

- Keeping `spsf-snabbskjutning-25m` and `issf-25m-rapid-fire` on the
  manual-corners path now has a **measured** basis, not an inherited one.
- The ring-choice control added for cropped photos is answering a case that
  occurs in two-thirds of real photos, not an edge case.

`guess_kind` remains unreliable, as the spike says. Of the 15 photos it
called milsnabb, two were spot-checked: one genuine snabbpistoltavla, one
plain 25 m precision face on a backing target, misclassified. **No rate is
claimed** — 147 photos were not labelled by type.

---

## 2. Hole vs. repair patch — corrects the spike

> "**Repair patches are indistinguishable from holes** by any classical
> feature I tried." — `cv-spike-report.md` §, and repeated in the failure
> table

**This is not true of classical features in general.** It is true of the
features the spike tested, which were all _shape_ descriptors — size,
solidity, dark core, backing colour — and which it correctly found to be
weak or actively inverted. The report then reasons that the real cue is
texture and that texture must be learned. Texture is expressible
classically, and those descriptors were not tried.

### Method

All 582 candidate blobs the existing detector proposes across the corpus
were cropped (48 px at 4 px/mm = 12 mm), scored on seven hand-built
features, and **labelled by eye**: 231 holes, 138 repair patches, 92
printed ring digits, 121 blur / card-edge / background.

### Single-feature separation, hole vs. patch

| feature                      |       AUC |
| ---------------------------- | --------: |
| local std-dev                | **0.943** |
| colour std-dev               | **0.942** |
| mean gradient                |     0.916 |
| centre darkness              |     0.876 |
| high-frequency energy        |     0.838 |
| gradient-orientation entropy |     0.780 |

0.94 from a single number. The mechanism is visible in the crops: a patch
is flat — uniform fill, straight manufactured edges — and a hole has a
bright torn-paper rim against dark ink. Local variance separates those
immediately.

### Classifier

Logistic regression on all seven features, **5-fold cross-validated with
folds split by photo** so crops from one photo cannot leak across folds.
All 582 candidates, every non-hole counted as a negative (231 positive,
351 negative). **AUC 0.924.**

| threshold |  recall | precision | false positives / photo |
| --------: | ------: | --------: | ----------------------: |
|       0.4 |     87% |       79% |                    0.43 |
|   **0.5** | **84%** |   **84%** |                **0.28** |
|       0.6 |     77% |       88% |                    0.19 |
|       0.8 |     51% |       95% |                    0.05 |

The spike measured **24% precision, 3.2 false positives per photo**. This
is roughly a **tenfold cut in false positives**, from a logistic
regression on seven numbers — no model, no inference runtime, no new
dependency.

---

## 3. What this does and does not change

**It fixes precision, not recall.** "Recall" above is recall _of candidates
the existing blob detector proposed_, not of holes on the target. The
proposal stage is what the spike measured at 24% recall, and §1
corroborates it — median 4 found per photo, 11% of photos yielding nothing.
Chained, end-to-end recall stays near 20% while precision rises from ~24%
to ~84%.

So the blocker has moved, and it is worth being precise about where:

- **Solved**: telling a hole from a repair patch or a printed digit.
- **Not solved**: finding the holes in the first place.

If a learned detector is still needed, it is needed for **recall** — not
for the hole/patch distinction the report gives as the reason.

**The cheapest untested lever follows directly.** The proposal stage is
tuned conservatively because nothing downstream could reject a false
positive, so every loosened threshold went straight into the 24% precision
figure. With an 84%-precision filter behind it that constraint is gone: it
can propose far more aggressively and let the filter clean up. That is a
threshold change, not new technology, and it is untested.

A before/after diff of two rectified photos is the other route, with the
complementary profile — near-perfect proposal recall, weak precision — and
in a multi-series session it is free, because a photo is already stored per
series.

---

## 4. Limitations, stated plainly

- **The labels are the author's, by eye**, not the shooter's ground truth,
  and were made knowing what the experiment expected to find.
- **Python spike, not the shipped port.** Indicative of the algorithm, not
  a test of `app/src/features/photo-scoring/opencv.ts`.
- **Nothing here measures hole-centre accuracy**, which is what the SHB
  edge-touch rule actually needs. The spike's budget is ~0.5 mm and remains
  unmeasured — §2 says which candidates are holes, not where their centres
  are to a fraction of a millimetre.
- **The production validity gate was not applied.** "Produced a fit" is not
  "would pass `checkGeometryValidity` and be shown to the user".
- **No end-to-end score was verified** against a known result. Several
  photos carry a handwritten total, which would validate a detector for
  free; that was not done.
