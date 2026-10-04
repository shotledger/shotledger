# Close-up lock on the milsnabb face — measurement, 2026-10

> **2026-10-03:** the Python in `spike/cv/` is retired; the CV tools are TypeScript in [`tools/cv/`](../../tools/cv/README.md) ([ADR 0018](../adr/0018-cv-tools-in-typescript.md)). The record below is as written.

Issue #347, "Automatic geometry for the milsnabb face". Reference
implementation: the `MILSNABB` ring model in `spike/cv/closeup_lock.py`;
evaluation: `spike/cv/eval_milsnabb.py`. Method and gate inherit from
[`cv-closeup-lock-2026-09.md`](cv-closeup-lock-2026-09.md), the precision
face's report.

**Superseded on 2026-10-03** by
[the last section](#2026-10-03-the-centre-cards-own-rings): a lock on the
centre card's own rings, in TypeScript, locks 23 of 37 real photos and is
wired into the app. What follows up to that section is the first attempt.

**First verdict: the bar does not hold, so nothing is wired into the app.**
The milsnabb face stays on hand-placed points. The model locks a close-up of
the 9–10 rings and refuses every negative it was given, but it refuses the
whole photos the maintainer actually takes. The precision lock that already
ships also locks some milsnabb photos at the wrong scale. Both are set out
below, with what would have to change.

## The face

SHB J.7.1 (p. 297), _snabbskjutningstavla_:

- ring diameters X 50, 10 100, 9 180, 8 260, 7 340, 6 420, 5 500 mm. Ring
  line k sits at 10 + 40k mm, k = 1..6, with the X at 25 mm;
- "Svart färg samtliga ringar 5-10": black across every ring from 5 to 10,
  with white ring lines;
- white aiming lines, 125 × 5 mm, left and right of the centre;
- "Spegel är tillåten". A _spegel_ is a replacement centre card stapled over
  the middle. It is printed with the same rings, grey or black. Most of the
  photos below carry one.

`shared/src/target-scoring/targets.ts` describes this face with
`referenceIsSolidBlack: false`, "a black annulus round a lighter middle".
J.7.1 says solid black. The lighter middle in the photos is a grey spegel.
Not changed here; it also decides how the face is drawn in the app.

## Method

The precision lock reads the radial line profile as a comb at whole multiples
of one 25 mm step. Here the comb has a phase: line k is at (k + ¼) steps of
40 mm. `RingModel` carries the step, the offset and the X, and `PRECISION` is
the default. Its synthetic fixture regenerates byte for byte, and its real
crops are checked against a copy of the module from before the change (see
Negatives).

What differs for `MILSNABB`:

1. **Step.** The period is scored on the X and the 10, 9 and 8 lines only. On
   a whole-face photo, tilt moves the 6 and 5 lines further than one period
   can absorb. "Off" is the strength half-way between neighbouring lines, so
   a scale that lands on every other line (90, 170, 250 mm) is marked down by
   the lines it skips. Each of three lines has to stand out on its own. Without
   that rule the precision face's 25 and 50 mm lines carried the mean on a
   synthetic precision close-up, and the lock passed its gate.
2. **Shape.** The first fit uses the three innermost lines. Each later pass
   looks for every line only near where the last homography puts it, and
   drops points more than 2 mm off their ring.
3. **Gate.** The precision gate (residual ≤ 0.5 mm, comb ≥ 8, rings ≤ 0.5 mm
   from their lines) plus three things:
   - at least three rings in frame, read at 25, 50, 90, 130, 170 and 210 mm,
     and three rings in the fit. The X and the 10 alone read 1:2 on both
     faces, so two lines never lock. A ring in frame on flat black still
     reads an offset (cv-closeup-lock-2026-09.md, last section);
   - the centre in frame;
   - each ring read on each quarter of its circle separately, every quarter
     within 0.5 mm.

The quarters are the important change. The precision yardstick averages the
line response round the whole circle. A ring can then sit on its line on one
side and 2 mm off on the other, and the average still passes. By eye that is
what the whole-photo locks did. On one photo the 50, 90, 170 and 210 mm
rings sat on their lines along one radius, but the 130 mm ring was about 2 mm
inside its line. The 130 mm line is printed on the spegel, near its edge. A
stapled card that does not lie exactly on the face's rings cannot be fitted by
the same homography as the face, and the per-quarter reading shows it.

## Evaluation

**Corpus.** 11 milsnabb photos, picked by eye from the 115 target photos in
the corpus: 10 of the maintainer's, 1 contributed. None is labelled. The 104
other target photos serve as negatives. **Eleven photos is a small sample**,
and the crops below are cut from those same photos, so they are not
independent of one another.

**What "truth" is here.** There is no hand-labelled milsnabb geometry.

- **Reference.** The milsnabb lock on the whole photo, held only to the
  precision report's whole-circle yardstick on the 25–130 mm rings. It
  passes on 7 of the 11 photos, and only those 7 are cropped. Its 50 and 90 mm
  rings were checked by eye on 4× zooms of the four axis crossings of each
  ring on every reference: 56 crossings, all on the printed line. Its
  130 mm ring is not always right (see Method). So agreement with the
  reference is measured within 90 mm of the centre only.
- **Ring-line offset.** The same self-referential yardstick as the precision
  report, now read per quarter. It says where the lock's circles sit against
  the lines in the photo. It cannot tell whether a line is the ring the lock
  thinks it is.
- Crops are upsampled from the photo, so they are blurrier than a real
  close-up: pessimistic, as in the precision report.

**Views.** These photos are close-ups already, about ±125 mm across, so the
wider views of the precision report do not fit inside them. The views are a
half-width in mm, 1.33 times as tall, centred and off-centre by up to 30%:
the 10 (±55 mm), the 9–10 (±100 mm) and a wider 9–10 (±120 mm).

| View                | Locks and passes the gate | Photos locked | Median offset, per quarter / whole circle | Centre against the reference, median (max) | Radius against the reference, median |
| ------------------- | ------------------------: | ------------: | ----------------------------------------: | -----------------------------------------: | -----------------------------------: |
| the 10 (±55 mm)     |                      2/21 |           1/7 |                              0.4 / 1.0 mm |                               0.8 (0.8) mm |                               0.4 mm |
| 9–10 (±100 mm)      |               16/20 (80%) |           6/7 |                              0.4 / 0.3 mm |                               0.4 (0.6) mm |                               0.2 mm |
| 9–10 wide (±120 mm) |                       0/6 |           0/3 |                                         — |                                          — |                                    — |
| whole photo         |                      0/11 |          0/11 |                                         — |                                          — |                                    — |

The 10 view mostly shows two lines and is refused by design. When it locks,
the corners of the crop hold enough of the 9 line. On the 9–10 view the
lock agrees with the reference: every lock's centre is within 0.6 mm of it.
For comparison, the precision report's whole-circle median there is 0.1 mm.

The wider view and the whole photo pass none. On all but one, the reading
per quarter puts a ring 0.7–2.9 mm off its line somewhere, mostly the 130 mm
ring at the edge of the spegel or a face ring beyond it. The last whole photo
fails another part of the gate. Read over the whole
circle instead, 7 of 11 whole photos would pass. That is the reference
above, and the eye check showed it 2 mm off on one of them.

A lock takes about 0.6 s per photo in Python, against 0.6–0.8 s for the
precision lock.

## Negatives

Any lock on these is wrong.

| Negative                                                              |                  Locks that pass |
| --------------------------------------------------------------------- | -------------------------------: |
| milsnabb crops with the centre out of frame                           |                         **0/41** |
| the 104 other target photos under the milsnabb model (crops and full) |                       **0/1041** |
| synthetic: precision face under milsnabb, two lines, centre out       |                          **0/3** |
| milsnabb photos and crops under the **precision** model               | **11/99**, on 5 of the 11 photos |

The crops of the other photos are the precision report's views plus crops
the size of the milsnabb views. 96 of the photos have a precision disc lock
to centre them on. The other 8 run whole.

The last row is the lock that already ships, unchanged. It locks milsnabb
photos as precision faces:

- on 3 whole photos, at about three times the true scale;
- on 6 crops of the 10, where the X and 10 lines sit at 25 and 50 mm. Those
  are the precision face's 10 and 9 radii, so the millimetres may well be
  right, but every ring value would be wrong;
- on 1 wider crop and 1 crop with the centre out of frame.

The app runs it only on a precision session. So this matters when the
session's discipline and the target on the photo disagree. It predates this
work and does not change with it: on 713 crops of the precision photos, the
precision model here gives exactly the same lock as the module before the
ring model (482 of them pass the gate).

The cut-off gates were not tuned on these photos. The quarter reading and the
line-presence rule came from two failures: a whole photo checked by eye, and
a synthetic precision close-up that the milsnabb model locked. Neither is a
pass rate.

## Consequences

The bar in the issue was: lock-and-pass comparable to the precision report
(80–89% on its three views), and zero wrong locks on every negative. Neither
half holds.

- **Coverage.** The milsnabb model passes only on a close-up of the 9–10
  rings, 80% of 20 crops from 6 photos. It passes on none of the whole photos
  the maintainer takes. Shipped as it is, it would almost never fire.
- **Cross-face.** The milsnabb model has no wrong locks. The shipped
  precision lock does, on milsnabb photos (above), and fixing that changes
  precision behaviour, which this work was asked to leave alone.

So the milsnabb face stays on hand-placed points (`faces.ts` unchanged). The
Python model is committed with this report, so the next attempt starts from
it.

**What would move it**, each a decision for the maintainer:

1. **Two geometries.** A spegel is scored by its own rings and the face by
   its rings, and the photos show the two can differ by about 2 mm. The lock
   could fit and gate the spegel's rings alone and offer the lock only inside
   the card, or fit the card and the face separately. Either is a product
   choice about what a lock may certify.
2. **The precision lock on a milsnabb photo.** Requiring a third ring line
   in frame, as the milsnabb model does, would refuse the two-line close-ups;
   the whole-photo wrong-scale locks would need their own check. Both change
   precision results, so the precision report would have to be measured again.
3. **More photos.** 11 photos, 7 with a reference, is too few to set a
   gate's thresholds. A labelled set would also replace the self-referential
   yardstick with a measured error.

## 2026-10-03: the centre card's own rings

Issue #495, resumed. Implementation: `app/src/features/photo-scoring/milsnabb-lock.ts`,
a sibling of `closeup-lock.ts` that reuses its centre vote, polar ridge,
ellipse and robust homography. Evaluation:
`tools/cv/eval/milsnabb.eval.ts`, which runs the app's TypeScript in
Node on 2048 px greyscale PGMs (ImageMagick, as `tools/cv/eval/prep.sh`).
There is no Python twin: the TypeScript is the reference (ADR 0018).

**Verdict: the bar holds for the milsnabb lock, and it is wired in.** It
locks 23 of 37 real photos (9/15 close-ups, 13/21 whole targets with a card)
where the first model locked none, never with fewer than three rings, and
passes none of 137 crops with the centre out of frame or 1631 precision
photos and crops. The rest of the bar's "vice versa", the shipped precision
lock on milsnabb photos, still fails and is #495's second item. Two
limitations stay: the 7 to 5 rings follow the card, not the face, and one
ring crossing in 368 was 0.8 mm off by eye.

### Why whole photos failed

The first model (Python) on all 24 milsnabb photos then in the corpus, read
ring by ring and quarter by quarter on overlays:

- **The fit spanned two sheets.** It fitted the X to the 6 line and the
  black's edge with one homography. The X, 10, 9 and 8 lines are printed on
  the centre card; the 7 and 6 lines on the face behind it. Fitted to the
  card's lines alone, the 7 and 6 lines then read a median 1.4 mm off, and up
  to 3 mm (the edge of the search) — the card is stapled where it lands.
  With both in one fit, every ring was pulled part of the way, and some
  quarter of some ring always ended up more than 0.5 mm off.
- **The black's edge is not a line.** The first model fitted a ring at
  250 mm, which is the edge of the black, a step rather than a thin line; the
  line filter answers on both sides of it.
- **The lines are 1 mm wide, measured to their outer edge.** A ring's
  diameter runs to the outer edge of its line (the scoring edge), and these
  lines are about 1 mm wide (J.7.1 allows 0.5–1.0). The first model put the
  line's centre on the ring's radius, so the X line read a few tenths of a
  millimetre inside its circle on almost every photo, and the scale stretched
  to compensate.

### The lock

- **The card's rings only:** the X, 10, 9 and 8, all on the card. Holes are
  scored on what is in front of them, so the card's geometry is the one to
  score with. On a face without a card the same four lines are printed on
  the face.
- **Line centres 0.5 mm inside the ring**, so the circle the lock reports is
  the ring's outer edge. Over the passing locks the four lines then read a
  mean offset of +0.03, 0.00, +0.04 and −0.07 mm; no trend with radius.
- The period search, the guided fit and the trimming are the first model's,
  scored on these four lines.
- **Gate:** residual ≤ 0.5 mm, comb ≥ 8, at least three of the four rings in
  frame, the centre in frame, and every quarter of every ring in frame within
  0.5 mm of its printed line.

### Real photos

37 milsnabb photos: the 24 then in the corpus and 13 that the maintainer
confirmed on 2026-10-03, during this work (now in the corpus too). Nothing
was tuned on the 13; they were run once the lock above was fixed, and are
also shown on their own.

| Framing (manifest) | All 37          | First 24 | The 13 |
| ------------------ | --------------- | -------: | -----: |
| close-up           | 9/15            |      5/9 |    4/6 |
| spegel-over-full   | 13/21           |    10/15 |    3/6 |
| black (no card)    | 1/1             |        — |    1/1 |
| **all**            | **23/37 (62%)** |    15/24 |   8/13 |

The first model locked 0 of 11.

**By eye.** Every one of the 23 passes was drawn: the lock's line-centre
circle on 4× zooms of the four axis crossings of each of the four rings
(368 tiles, less those out of frame). The circle runs within the width of the
printed line at nearly every crossing. The exceptions are on the 8 ring where the white
aiming bar crosses it, on two photos (about 0.8 mm off on a heavily pasted
target, about 0.5 mm on the other), and one photo whose card reads about
0.4 mm in on every ring. The yardstick averages a quarter, so a single
crossing can be worse than the quarter it lies in.

**Refused** (14): on 9 photos only the 8 ring is off, by 0.6–1.9 mm in one or
two quarters while the X to 9 sit within 0.3 mm. Zoomed, the printed line
really is there, so it is the card rather than the fit: it is not flat near
its edge, or not quite in the plane of the face. Two more are off at an inner
ring too (a steep view; a doubtful all-black card). Three are whole targets on a stand,
small in a tall frame, about 1 px per mm, where the lock never finds the
step (comb 4–6).

**Crops.** Cut from the 23 passing photos around their lock, upsampled to
2048 px, centred and twice off-centre by up to 30%:

| View                | Passes      | Centre against the whole-photo lock, median (max) | Radius within 90 mm, median |
| ------------------- | ----------- | ------------------------------------------------: | --------------------------: |
| the 10 (±55 mm)     | 0/66        |                                                 — |                           — |
| 9–10 (±100 mm)      | 38/54 (70%) |                                    0.06 (0.15) mm |                     0.05 mm |
| 9–10 wide (±120 mm) | 27/37 (73%) |                                    0.04 (0.09) mm |                     0.03 mm |

The 10 alone shows two lines and is refused by design.

**The face beyond the card.** Through a card lock, the face's 7 and 6 lines
read a median 1.4 mm off, 90th percentile 3 mm. The app keeps one homography
per photo, so the 7, 6 and 5 rings it draws can miss the printed lines by that
much, and a hole out there near a line can score wrong. The manual says so
(explanation, "The rapid-fire face"). Scoring the face's own zone needs a
second mapping outside the card, which the stored geometry
(`series.photo_geometry`, one 3×3) does not hold.

### Negatives

| Negative                                                         | Passes the milsnabb gate |
| ---------------------------------------------------------------- | -----------------------: |
| milsnabb crops with the centre out of frame                      |                **0/137** |
| precision photos, whole (all 507 in the manifest)                |                **0/507** |
| precision photos, crops around the disc lock (every third photo) |               **0/1124** |
| synthetic precision close-up (unit test)                         |                  **0/1** |

The precision crops are the precision report's three views and crops the
size of the milsnabb views, centred and once off-centre, plus three with the
centre out of frame, on the 149 of 169 photos whose disc lock passes.

On precision photos the yardstick is what refuses: on 289 of the 507 whole
photos and 917 of the 1124 crops it is the only part of the gate that fails.
Every whole-photo lock is at least 1.2 mm off somewhere, against a gate of
0.5. Two crops came closer, 0.5 and 0.6 mm, each reading only two rings, the
1:2 pair both faces share; the three-ring rule refused them. On the
milsnabb crops with the centre out of frame, 20 locks fit the rings well and
are refused by the centre rule alone.

**The other way round**, the precision lock that ships, on milsnabb photos:
4 of 37 whole photos pass, and 24/66, 10/54 and 7/37 of the three views, and
21 of 137 crops with the centre out of frame. That is the second item of
#495 and is unchanged here; the app runs the precision lock only in a
precision session. As a guard there, the milsnabb fit (its gate without the
centre rule) flags 18 of the 21 precision passes on the 9–10 views and the
whole photos, but none of the 24 on the 10 alone, where it sees two lines.

### In the app

`scan.tsx` runs the milsnabb lock for a session whose discipline's face is
the milsnabb sheet (`spsf-snabbskjutning-25m`, and `issf-25m-rapid-fire`,
the same sheet). The face comes from the discipline and is never guessed.
The disc lock is still never tried. A passing lock goes straight to marking;
a refusal goes to the four corners, as before, with a hint that the rings
could not be read. Hole suggestions stay precision-only. In Node, on the
pure operations, the lock takes 1.3–3 s per photo on a loaded machine; on a
device it uses the close-up lock's OpenCV operations.

**Not measured here:** the lock on a device. Unit tests
(`milsnabb-lock.test.ts`) cover synthetic photos: a tilted card 1.8 mm off
the face, a close-up of the X to 9, the centre out of frame, the X and 10
alone, and the precision face.
