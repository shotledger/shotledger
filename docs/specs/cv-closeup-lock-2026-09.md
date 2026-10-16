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
  run at the session's calibre and, only when they find no hole there, at half
  of it ("The hole-size check's cost" below). Through a lock twice
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

**Left for #526** (next section). Of the 12 crops of the 10 that are left, 5 read holes
at the full calibre, 6 have no hole the detector finds, and 1 reads a single
hole at half the calibre, above the cut. Their perspective stays within
0.55–1.52. Without holes, nothing in the ring lines tells them apart.

### The hole-size check's cost

The decision, and the options it rules out, are in ADR 0022. Issue #528. The check ran the hole detector twice, and on a lock that passed
the guards the suggestions ran it a third time, at the calibre, on the same
canvas. Two of those runs bought nothing, so it was cut to one without
changing any guard's verdict (`holeSizeCheck`):

- **The half-calibre run** happens only when the calibre's run finds no hole.
  Any hole at the calibre abstains, so its result was never used.
- **The suggestions** reuse the calibre's candidates
  (`proposeHolesAsync`'s `candidates`). The canvas, face and calibre are the
  same, so the candidates are the same.

`guards.eval.ts` on the sets above, run before and after on main as of #634:
all 1,864 rows are identical apart from timings, `refusedBy` and `asks`
included, and the milsnabb table above comes out the same. No guard refuses
any of the 1,184 precision images where the close-up lock is used: 224 whole
photos and 960 crops (#634 changed the disc lock the crops are cut from,
hence not 1,231). On 1,105 of them (93 %) the calibre's run finds a hole and the
half-calibre run is skipped. Suggestions from the reused candidates match a
fresh detector run on all 1,289 images whose close-up lock passes its gate.

Time spent in the check in Node (pure-JS maps, 10 eval shards in
parallel, so only the ratio counts): median 2.7 s before, 1.5 s after; 0.56
of the time before, over all 1,219 images where the check runs. The
suggestions' own detector run, about as long as the check's calibre run, is
gone on top of that.

On the emulator (dev build, software GPU), three scans of a drawn precision
close-up with four holes, before and after, `[scan-timing]`:

| Stage              |      Before |       After |
| ------------------ | ----------: | ----------: |
| hole-size check    | 10.0–10.4 s |       4.6 s |
| hole suggestions   |   4.8–4.9 s | 0.16–0.28 s |
| total (to marking) | 27.6–28.5 s | 22.7–25.2 s |

The suggestions are the same (one hole suggested in both). These are
emulator numbers; the phone timing that #528 asks for is still to do.

Not done: running the check only on tight crops. That drops the guard on
every other lock, so its verdicts are not the same by construction. Rejected
after the phone timing (ADR 0022).

**Where the detector's time goes** (#648). `[scan-timing]` now logs whether
the half-calibre run happened and, per detector run, its maps, peaks and
features. On the emulator (release build) the maps take about 4.6 s of a run
at the calibre, peaks 0.3 s and features 0.5 s. The maps' cost is per-pixel
JavaScript under Hermes (the padding mask, the ring lines, the glyph
components), not OpenCV: its three blurs take 0.5 s. All of those maps but the
blurs are the same at any calibre, so a canvas's second run reuses its first's
(`canvasMapsOf`). Candidates come out bit for bit the same as before, on 12
corpus canvases at both calibres. On a precision close-up whose half-calibre
run happens (about 7 % of them, the slow tail), three interleaved scans each:

| Stage                         |      Before |       After |
| ----------------------------- | ----------: | ----------: |
| hole-size check               | 13.6–18.3 s |  9.8–10.4 s |
| maps, run at half the calibre |   4.6–6.1 s | 0.71–0.76 s |

What remains in that case is the half-calibre run's features (310 peaks,
about 3.3 s). Every close-up lock still waits for the calibre's run before the
marking screen opens.

The padding mask and the glyph map's connected components, dilations and
erosions now run in OpenCV on a device (`MapOps.components`, `dilate`,
`erode`). Those are exact on 0/1 masks: on two corpus close-ups on the
emulator, the scoring zone, black zone, glyph map and MAD sample came out
identical pixel for pixel to the pure path, and the per-canvas maps took
1.9 s against 3.5 s and 3.9 s against 6.7 s in the same runs.

The remaining passes then went down from about a dozen to five: the padding
test (`MapOps.atLeast`, OpenCV's `compare`) moved native; the zone medians come
from a histogram of quarter steps, exact because the half-resolution canvas
holds 2x2 means of bytes; the ring lines are found in the radius loop; and both
zones share one pass for their thresholds and one for their extents.
Candidates are bit for bit those of the previous code on 16 corpus canvases at
three calibres, and the native maps match the pure ones pixel for pixel on the
emulator. There, the maps of a run at the calibre took 1.67–1.74 s against
2.39–2.48 s, interleaved on one corpus close-up.

**The per-candidate features** were next: about 9 ms a peak on the phone,
so 2.7–3.3 s for the half-calibre run's 310 peaks. Node without a JIT
(`--jitless`) takes about as long a peak, and there `holeFeatures` was three
quarters of it: its 3- and 5-tap convolutions looked up the border reflection
for every pixel and tap. They now look it up once per pass and write the taps
out inside the border, summed in the same order, so the values are the same to
the bit (`hole-features.test.ts` pins them against the old code). The radial
profile picks its bin without a loop over all five, and the 48 px crop
reflects each column once. On 184 corpus canvases (the guarded canvases of the
photos whose half-calibre run happens), candidates came out `isDeepStrictEqual`
to `main`'s at 5.6, 2.8 and 9.65 mm, and the lock-step fixtures regenerate
unchanged. `--jitless`, interleaved with `main` on 12 of those canvases:

| Features, per peak |  `main` | This change |
| ------------------ | ------: | ----------: |
| run at 5.6 mm      | 14.1 ms |      7.7 ms |
| run at 2.8 mm      |  9.9 ms |      4.7 ms |

The guard reads only candidates with a blob under the peak, and about one
peak in five of the half-calibre run has none. That run now drops those peaks
after the blob shape (`holeCandidates`' `blobOnly`), before `holeFeatures` and
the edge straightness. The calibre's run keeps every peak, because the
suggestions reuse those candidates. On the same 184 canvases, every guard
verdict and half-run decision is the same as before, the calibre's candidates
are the same, and the half-calibre run's are exactly the previous run's with
`b_area` above 0 (`isDeepStrictEqual`); 20 % of the 42,667 half-calibre peaks
are dropped. Under `--jitless`, interleaved on the same 12 canvases, the
features of the run at 2.8 mm took 14.3 s in all against 17.5 s: 3.8 ms
against 4.7 ms a peak.

## 2026-10-06: asking for the face when the X line is missing

Issue #526. Precision prints an X ring at 12.5 mm inside its 10; milsnabb
prints nothing inside its X. When the lock puts milsnabb's X and 10 on
precision's 10 and 9, no line runs where the lock puts the X.

`xRingReading` (`closeup-lock.ts`) takes the median of the lock's thin-line
response (`CloseupWork.lines`) round the 12.5 mm circle, round the 10 at
25 mm, and in the black at 6.25 and 18.75 mm (the gaps, averaged). The median,
because a ring line runs the whole way round. `xLineMissing`
(`precision-guards.ts`) calls the line missing when the X reads under
**0.15 × the 10** and under **1.5 × the gaps**. It abstains when any of them
is mostly out of frame.

It is not a guard. Pasters over a shot-out precision centre hide the thin X
line on most of the circle, and that reads the same as a milsnabb crop: no
threshold refuses no precision image and still catches the crops. So
`scan.tsx` asks instead. After the three guards pass on a close-up lock, a
missing X line asks the shooter "Which target is this?", Precision or
Military Rapid Fire. The answer is kept per session, in memory
(`face-answers.ts`), so the question comes at most once per session while the
app runs; later photos whose X line is missing take the same answer without
asking. A milsnabb answer refuses the close-up lock as the milsnabb guard
does: the disc lock when it passes, otherwise the milsnabb reason.

Measured with `tools/cv/eval/guards.eval.ts` (`xRing`, `xMissing`, `asks`) on
the sets of the guards section. Counted are images where the app uses the
precision close-up lock and no guard refuses it.

| Milsnabb images        | Left after the guards | Asked |
| ---------------------- | --------------------: | ----: |
| Whole photos           |                     1 |     0 |
| Crop of the 10         |                    12 |    12 |
| Crop of the 9–10       |                     0 |     0 |
| Wider crop of the 9–10 |                     0 |     0 |
| Centre out of frame    |                    19 |     1 |
| **Total**              |                    32 |    13 |

**Precision.** Of the 1,231 precision images where the close-up lock is used
and no guard refuses it, 21 are asked (1.7 %): no whole photo, and 21 crops
cut from 4 photos. Over all 1,270 precision images whose close-up lock passes
its gate, whichever lock the app then picks, the X line reads missing on 29
(2.3 %, from 11 photos). These are the paster-covered centres.

The centre-out-of-frame crops are still open: there the 12.5 mm circle lands
on other lines, or out of frame.
