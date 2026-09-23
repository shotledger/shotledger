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
