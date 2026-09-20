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
solidity, dark core, backing color — and which it correctly found to be
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
| color std-dev                | **0.942** |
| mean gradient                |     0.916 |
| center darkness              |     0.876 |
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
- **Nothing here measures hole-center accuracy**, which is what the SHB
  edge-touch rule actually needs. The spike's budget is ~0.5 mm and remains
  unmeasured — §2 says which candidates are holes, not where their centers
  are to a fraction of a millimeter.
- **The production validity gate was not applied.** "Produced a fit" is not
  "would pass `checkGeometryValidity` and be shown to the user".
- **No end-to-end score was verified** against a known result. Several
  photos carry a handwritten total, which would validate a detector for
  free; that was not done.

---

## 5. The filter, re-fitted and measured end to end (2026-09-16)

§2 fitted the seven-feature filter on candidates the detector proposed and
reported it at 84% / 84%. §3 said plainly what that did not answer: those are
recall and precision **of candidates**, not of holes, and "the cheapest
untested lever" — loosening the proposal stage behind the filter — was
untested. #264 asked for both, on both corpora.

Both questions are now answered, and they answer opposite ways: **the filter
is a large win, the loosened stage is not.**

### Method — the ground truth changed

§2 labelled candidates. That cannot measure recall: a hole no detector
proposed never becomes a row. This round labels **holes** instead. Every photo
is rectified exactly as the pipeline does it, rendered under a coordinate grid
(`spike/cv/mark_holes.py`), and the hole centers are read off by eye. A
candidate is a true positive when it lands within 0.9 hole diameters of an
unclaimed mark (`spike/cv/score_stages.py`). Recall is then against holes.

31 photos, all passing the production geometry gate with the face prior on:
**20 contributed** (drawn at random from the 66 that pass) and **11 of the
maintainer's**. 147 marked holes. On the contributed subset the marks can be
checked against the independent by-eye counts behind §"Measured" of
`contributed-corpus-2026-09-15.md`: 94 marked against 99 counted — the five
missing are on the darkest, most heavily pasted cards, so this recall is if
anything **flattered** by about 5%.

### The proposal stages

`tight` is the shipped phase-1 stage. `loose` is the tuned loosening; `open`
is the same idea with every brake off (no printed-glyph suppression, threshold
6 MADs instead of 12, cap 200 instead of 40).

| Stage   | Candidates/photo |    Recall | Precision | FP/photo | Exact series |
| ------- | ---------------: | --------: | --------: | -------: | -----------: |
| `tight` |              7.7 | **65.3%** | **40.0%** | **4.65** |            1 |
| `loose` |             27.3 |     40.1% |      7.0% |    25.35 |            0 |
| `open`  |             55.1 |     82.3% |      7.1% |    51.16 |            0 |

Split by corpus, the picture is the same on both — contributed 67.0% / 34.0% /
85.1% recall, maintainer 62.3% / 50.9% / 77.4%.

**The tuned `loose` stage is worse than the stage it replaces**, on both
corpora, by a wide margin. The cause is visible in the rendered panels: its
printed-glyph suppression keys on a structure longer than 2.6 hole diameters,
and a printed digit on the 25 m face measures 37–40 px against a hole's 23 —
so the digits survive, saturate the 40-candidate cap ranked by response
strength, and **push real holes out of the list**. It proposes three times as
much and finds fewer holes.

`open` does what loosening was supposed to do — recall 65% → 82% — and asks
53 false positives per photo for it.

### The filter behind each stage

Six features, not seven: the seventh was color std-dev and the production
canvas is gray-only. Center darkness is now a **magnitude** — see
`cv-assisted-detection-spec.md` §1 for why, and it is not a detail: fitted
signed, the filter rejects holes on white paper outright.

Logistic regression, 5-fold cross-validation **split by photo**, pooled over
all 31:

| Behind  | Threshold |    Recall | Precision | FP/photo | Exact series |
| ------- | --------: | --------: | --------: | -------: | -----------: |
| —       |         — |     65.3% |     40.0% |     4.65 |            1 |
| `tight` |       0.3 |     59.9% |     87.1% | **0.42** |        **4** |
| `tight` |   **0.5** | **59.2%** | **89.7%** | **0.32** |        **3** |
| `open`  |       0.3 |     64.6% |     73.6% |     1.10 |            1 |
| `open`  |       0.5 |     51.7% |     85.4% |     0.42 |            1 |

Cross-validated AUC: **0.942** behind `tight`, 0.948 behind `open`.

Two readings, both load-bearing:

- **Behind the existing stage the filter cuts false positives roughly 15×**,
  from 4.65 to 0.32 per photo, for 6 points of recall. Precision goes 40% →
  90%. And for the first time in any of these measurements, **photos come out
  exactly right**: 3 of 31 at threshold 0.5, 4 at 0.3, against **zero in 251
  photos** across the three earlier rounds.
- **Behind the loosened stage it does not pay.** At a matched 0.42 FP/photo,
  `open` reaches 57.8% recall where `tight` reaches 59.9%, with one exact
  series against four. `open`'s higher AUC is real and irrelevant: the filter
  has to be run so hard to control 51 false positives per photo that it
  discards holes faster than the loosened stage finds them.

**So the loosened proposal stage is not shipped.** It stays in
`spike/cv/hole_filter.py` as a measured negative result.

### Does the filter generalize across shooters?

The question `contributed-corpus-2026-09-15.md` posed. Fitted on one corpus,
applied to the other, never having seen it:

| Fitted on        | Tested on        |   AUC | Recall | Precision | FP/photo |
| ---------------- | ---------------- | ----: | -----: | --------: | -------: |
| contributed (20) | maintainer (11)  | 0.898 |  45.3% |     92.3% | **0.18** |
| maintainer (11)  | contributed (20) | 0.875 |  63.8% |     56.6% |     2.30 |

**The discrimination generalizes; the threshold does not transfer from a
small fit.** AUC holds at 0.875–0.898 across shooters, phones and clubs — the
texture difference between a hole and a patch is not one club's paper. But the
11-photo fit puts its decision boundary in the wrong place for the other
corpus: precision falls to 57%. That is a calibration problem from 33 positive
examples, not a failure of the features, and it is the direct argument for
fitting on both corpora — which the shipped constants are.

### Limits

- **31 photos, 147 holes, marked by eye by the author**, who knew what the
  experiment expected. The same limitation §2 and the spike both carry.
- **The marks undercount** on the most heavily pasted cards (94 against 99 on
  the contributed subset), so every recall figure here is slightly optimistic.
- **4 of 96 labelled holes are outside the black zone.** Everything this filter
  claims about white-zone holes rests on four examples. The polarity fix means
  it is no longer _structurally_ biased against them; it is still barely
  evidenced there.
- **Zero centerfire holes, one caliber, two phones, two clubs.** Unchanged.
- **The cross-validated numbers are in-sample in one sense**: the feature set
  and the center-deviation change were chosen while looking at this data. The
  held-out table above is the honest generalization estimate, not the pooled
  one.
- Still the Python twin for the measurement. The TypeScript the app runs is
  pinned to it by a committed fixture, not by having been measured itself —
  see `cv-assisted-detection-evidence.md`.
