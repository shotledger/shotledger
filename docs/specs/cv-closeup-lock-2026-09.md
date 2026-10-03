# Close-up lock — measurement, 2026-09

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
