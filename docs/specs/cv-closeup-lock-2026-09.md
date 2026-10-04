# Close-up lock — measurement, 2026-09

> **2026-10-03:** the Python in `spike/cv/` is retired; the CV tools are TypeScript in [`tools/cv/`](../../tools/cv/README.md) ([ADR 0018](../adr/0018-cv-tools-in-typescript.md)). The record below is as written.

Issue #347. Reference implementation: `spike/cv/closeup_lock.py`; evaluation:
`spike/cv/eval_closeup.py`.

## The problem

The automatic lock fits the 25 m precision face's black disc and anchors on
its outer edge, the 7 ring. A good shooter photographs only the rings they
hit, the 7–10 or just the 9–10, so that edge is out of frame. The lock then
fails, and the shooter has to place four points by hand.

## Method

On this face every ring line from the 10 outward sits a whole multiple of
25 mm from the centre; the X ring at 12.5 mm is the only exception. So the
lock never has to read a ring's number:

1. **Centre.** The normals of concentric lines all pass through the centre, so
   a vote along each strong edge's gradient peaks there.
2. **Step.** From that centre the radial line profile is periodic. The period
   is scored as line strength at its multiples minus strength half-way
   between them, so neither double nor half the period can win on its own.
3. **Shape.** Points on ring k, divided by k, all lie on one ellipse. Its fit
   gives the tilt and a better centre, and a homography fitted to every ring
   point then follows perspective.
4. **Half-step guard.** When holes have taken out the 10 and 9 lines, the X
   ring's half step can still win. The fit shows it: every odd ring then sits
   between two printed lines. The lock refits at double the period and keeps
   whichever fit sits on the lines.

**Gate:**

- median fit residual ≤ 0.5 mm;
- comb score ≥ 8;
- every ring in frame within 0.5 mm of a printed line.

## Evaluation

There is no hand-labelled close-up set, so close-ups were cut from the
corpus. The corpus is 99 photos whose disc lock passes its gate. The crops:

- the 9–10 view (±55 mm);
- the 8–10 view (±80 mm);
- the 7–10 view (±110 mm);

each centred and randomly off-centre, and upsampled to 2048 px. Upsampling
makes them blurrier than a real close-up taken nearer, so these numbers are
on the pessimistic side.

- **Negatives.** Crops whose centre is out of frame, i.e. a photo of the outer
  rings. Any lock on one of these is false.
- **Yardstick.** For each lock, how far each of its rings sits from the
  printed line in the same crop. The disc lock is held to the same
  measurement.

| Crop                |          Locks and passes the gate | Agrees with the disc lock | Closer to the printed lines than the disc lock | Median offset (close-up / disc) |
| ------------------- | ---------------------------------: | ------------------------: | ---------------------------------------------: | ------------------------------: |
| 9–10 rings          |                      155/194 (80%) |                       143 |                                        146/155 |                    0.1 / 0.7 mm |
| 8–10 rings          |                      165/185 (89%) |                       156 |                                        157/165 |                    0.1 / 0.7 mm |
| 7–10 rings          |                      143/164 (87%) |                       133 |                                        133/143 |                    0.2 / 0.6 mm |
| Centre out of frame | 0/83 locked (the gate refused all) |                         — |                                              — |                               — |

"Agrees" means the centre is within 2 mm of the disc lock's and the rings are
within 0.5 mm of the printed lines. The disagreements that were drawn and
inspected were the disc lock's errors:

- one photo is a different face that the disc lock took for a precision face;
- one is a real close-up that the disc lock locked falsely, off-centre and at
  the wrong scale, and still passed its gate.

It runs in about 0.8 s per photo in Python.

The reference was then made portable for the app's port: the centre vote at
512 px with a full-resolution pass in a window around its peak, and a
hand-written robust least squares in place of scipy's. Re-run on the 38 photos
of one corpus, no crop size did worse than before, and the gate still refused
every crop whose centre was out of frame; about 0.6 s per photo.

The lock is not meant for full photos, and on those it passes its gate on
only 19 of 99. Where it does pass, it sat closer to the printed lines than the
disc lock on 17.

## Consequences for the app

- **Order.** Run the disc lock. Run the close-up lock too, and when both pass,
  keep the one that sits closer to the printed lines. That also catches the
  disc lock's false passes on close-ups. When neither passes, fall back to
  the four hand-placed points.
- **Faces.** Precision faces only. The 25 mm step is this face's; the
  milsnabb face's rings are 40 mm apart, and a lock that assumed 25 would be
  confidently wrong.
- **Still open.** The printed ring numbers are not used. They would be a
  second check on the step, and they are what a close-up with no ring line
  but the 10 would need.

## 2026-10-03: a lock at a multiple of the step

Issue #406. Re-measured on 285 real photos contributed on 2026-10-03 (three
shooters, mostly a spegel pasted over a full target), with
`spike/cv/eval_closeup_real.py`. It runs both locks on whole photos and
compares their scales, and it draws each lock's numbered rings for checking by
eye.

**The bug.** The lock could settle on 2, 3 or 4 times the true ring step, so
that its 10 ring was drawn on the printed 9 line, or on the black's edge. The
gate cannot see this. Every whole multiple of 25 mm is a printed line, so a
lock at 50 mm per step still finds a line under each ring it checks. The gate
is also measured in the lock's own mm, so a 2×-coarse lock is held to a gate
twice as loose. Where the disc lock also passed, the choice then preferred the
close-up, because its rings looked closer to the lines. Every hole would score
one or more rings too high. All of these were whole-face photos, not
close-ups: a coarse step needs lines at 50, 100 and 150 mm in frame. The comb
in `_best_period` lets the black's edge, by far the strongest line, carry a
coarse period. The existing check against half or a third of the period
scores a 2× candidate at about 0, because its half-way points are real lines.

**The fix.**

- **The finest step whose lines are all printed.** After the fit, the lock
  tries ¼, ⅓ and ½ of its step and takes the finest one whose extra lines are
  really there. Lines are read as the median along the circle, because a ring
  runs the whole way round while digits, holes and patches cover only part of
  it. The extra lines are tested one class (j mod m) at a time, so a 2×
  lock's real half-step lines cannot carry a ¼-step candidate. Each class must
  reach half the weakest of the fit's own lines and 1.8 times the gaps between
  the finer step's lines. Radii stop at the 1 ring. The lock then refits at
  the finer step and keeps whichever sits closer to the lines.
- **The period after the half-step refit** is now doubled with the fit. It
  was left at the old value, which the finer-step refit read.
- **`chooseLock` refuses a close-up at ½, ⅓ or ¼ of a passing disc lock's
  scale** (±6 %). The disc lock is never off by a whole-number factor; where
  it is wrong, its scale is off by 0.63–0.88, so a veto on these ratios only
  never overrules a correct close-up.

| Real photos (285)                                   | Before | After |
| --------------------------------------------------- | -----: | ----: |
| Close-up passes at the wrong scale, used by the app |     35 |     0 |
| Close-up passes at the right scale                  |    136 |   154 |
| Right-scale passes lost or changed                  |      — |     0 |
| Wrong-scale passes stopped by the `chooseLock` veto |      — |     2 |

On the crops of the earlier corpus, the 9–10 and 8–10 views agree with the
disc lock as before, within one crop. The 7–10 view passes two crops fewer;
the passes lost were at the wrong scale. Crops with the centre out of frame
still never lock.

**Parity.** `spike/cv/parity/` runs the app's TypeScript lock in Node and the
Python reference on the same greyscale pixels and compares them. They agree
within 0.05 mm on all 20 real photos tried, before and after the fix. This is
the first stage of #488.

**Still open.** `_is_half_period` can promote a 2× lock to 4×, because on a 2×
lock the midpoints are real lines; the finer-step test then brings it back.
`_best_period`'s comb could saturate the black's edge so that the coarse
period never wins, but that lowers every comb score, and the gate's comb ≥ 8
would need recalibrating.

## 2026-10-03: a precision lock on a milsnabb photo

Issue #495. Photographed in a precision session, a milsnabb target can pass
the precision lock: 9 of 100 milsnabb crops and photos did after #493
(`spike/cv/eval_milsnabb.py`). The gate now also compares the face through
the lock: on precision, the paper at 112–140 mm is white; on milsnabb it is
still black. The median grey along circles in that zone, minus the median at
55–85 mm, over the photo's p5–p95 range, must reach 0.25. Over 163 real
precision locks with both zones in frame it was at least 0.58; on a milsnabb
photo it is about 0. Where either zone is out of frame, the check abstains.

It refused 1 of the 9; no precision photo lost a pass or changed lock (285
real photos). Most of the rest are tight crops of milsnabb's X and 10 rings,
whose 25 and 50 mm radii have the same 1:2 ratio as precision's X and 10:
line for line a precision 9–10 close-up at twice the size. Only an absolute
size can tell them apart, such as a hole's diameter against the session's
calibre.

### The three guards

`precision-guards.ts`. In `scan.tsx` they run only when `chooseLock` picks
the close-up lock in a precision session, in this order. A refused close-up
falls back to the disc lock when that passes; otherwise the photo is rejected,
with the first guard's reason.

- **Perspective.** The lock's projective denominator at each corner of the
  photo, over its value at the target centre, must stay within 0.5–2. A
  sign change means the horizon crosses the photo. No hand-held photo of a
  flat target is that oblique, but a lock on the wrong rings can be: one
  10-crop lock drew the canvas as two wedges with the horizon through it.
- **The milsnabb lock as a guard.** #508's milsnabb lock runs on the close-up
  lock's own work image. When it passes its gate, the precision lock is
  refused. Its gate needs three card rings in frame and three rings in the
  fit, so it cannot see a crop of the X and 10 alone.
- **Hole size.** On the close-up lock's rectified canvas the hole proposals
  run twice: at the session's calibre, and at half of it. Through a lock twice
  too large a hole reads half its size, so the detector finds it only at half
  the calibre. A hole's size is its blob's area as a disc's diameter, since the
  probabilities saturate at 1. The lock is refused when no hole is found at the
  calibre and the holes found at half of it have a median under 0.5 × the
  calibre. Any hole found at the calibre abstains, and so does a canvas with no
  holes. At half the calibre the detector also picks up paper texture, up to
  192 "holes" on one precision crop. On 91 precision images it found nothing
  at the calibre and up to 21 holes at half of it, and every median stayed
  above the cut.

Measured with `tools/cv/eval/guards.eval.ts`, which runs `chooseLock` against
the disc lock as `scan.tsx` does. It used the 37 milsnabb photos and the
milsnabb crops of `milsnabb.eval.ts` (same pixels), and 507 precision photos,
169 of them also cut into 9–10, 8–10 and 7–10 crops. Every count is of images
where the app would use the precision close-up lock.

Each image is counted under the first guard that refuses it.

| Milsnabb images, precision lock used | Images | Before | Perspective | Milsnabb guard | Hole size | After |
| ------------------------------------ | -----: | -----: | ----------: | -------------: | --------: | ----: |
| Whole photos                         |     37 |      4 |           0 |              2 |         1 |     1 |
| Crop of the 10                       |     66 |     24 |          11 |              0 |         1 |    12 |
| Crop of the 9–10                     |     54 |     10 |           6 |              4 |         0 |     0 |
| Wider crop of the 9–10               |     37 |      7 |           2 |              5 |         0 |     0 |
| Centre out of frame                  |    137 |     21 |           1 |              0 |         1 |    19 |
| **Total**                            |    331 |     66 |          20 |             11 |         3 |    32 |

Without the perspective guard the other two leave 45; it takes 13 of those.

**Precision.** No guard refused any of the 1,231 precision images where the
close-up lock is used: 224 whole photos and 1,007 crops. The milsnabb lock
passed on none of them. The margins are small on two guards:

- Perspective: the most oblique precision image is a 9–10 crop at 0.508 of
  the centre's denominator at one corner. Measured from the photo's corner
  instead of the target centre it read 0.48 and was refused, so the guard
  reads it relative to the centre.
- Hole size: the closest precision medians are 2.88 and 3.05 mm (two 9–10
  crops). A cut at 0.55 × the calibre would refuse both.

**A false refusal, fixed.** A noise-free synthetic precision close-up was
refused by the milsnabb guard; a noisy copy was not. The milsnabb lock put its
X and 10 on precision's 10 and 9 at the true scale, and its 9 on flat black.
There the line response is flat (about 1e-7 on the noise-free image), so the
search for the line's offset peaks anywhere in its ±3 mm window. On that image
it peaked within the 0.5 mm gate, so a ring with no line counted as read. On a
real photo, texture puts the peak at random across the window, which is why
none of 1,231 was refused. The fit itself used only two rings, so the gate now
also needs three rings in the fit (`MILSNABB_GATE.minLines` for both). It
refuses no milsnabb lock the old gate passed, in `milsnabb.eval.ts` or in the
table above. `milsnabb-lock.test.ts` draws that close-up.

**What is left.** The hole check catches few milsnabb photos. Of the 32 left,
15 have no hole the detector finds at either size, and 12 read holes at full
size, because the lock put milsnabb's X and 10 (25 and 50 mm) on precision's 10
and 9 at the true scale. No hole size can tell those apart.

**Still open: #526.** Of the 12 crops of the 10 that are left, 5 read holes
at the full calibre, 6 have no hole the detector finds, and 1 reads a single
hole at half the calibre, above the cut. Their perspective stays within
0.55–1.52. Without holes, nothing in the ring lines tells them apart.
