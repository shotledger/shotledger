# Scoring from a photo

Photograph the target, tell the app where the holes are, and it works out the
score from the target face's real dimensions.

## What it is, honestly

This is **assisted** scoring, not automatic scoring. You mark the holes; the
app does the geometry, the ring boundaries and the arithmetic.

It does not find the holes for you. That is a genuinely hard problem on paper
targets — a repaired target's patches look very much like fresh holes — and an
automatic detector that is wrong is worse than no detector, because you end up
correcting more than you would have marked.

## How to do it

1. **Photograph the target.** Get the whole target face in frame, as square-on
   as you can manage. It does not need to be perfectly straight.
2. **Set the corners.** Drag the four corner handles onto the target face's
   corners. This is what lets the app undo the angle you photographed from.
3. **Mark the holes.** Tap each hole. A loupe follows your finger so your
   fingertip is not hiding the thing you are aiming at.
4. **Check the score**, then save it to the series.

## Getting a good photograph

- Even light beats bright light. Hard shadows across the face cost you more
  accuracy than a dim photo does.
- Fill the frame with the target. A target that occupies a quarter of the photo
  has a quarter of the detail to work with.
- Square-on is ideal but not required — correcting the corners handles a
  moderate angle.

## What you get back

Beyond the score itself:

| Figure                        | What it tells you                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Windage** and **elevation** | How far the group's centre sits from the middle, left–right and up–down. A sight correction, essentially. |
| **Mean radius**               | Average distance from the group centre — the honest measure of consistency.                               |
| **Max spread**                | The two furthest-apart holes. One flier dominates it.                                                     |
| **Potential score**           | What the same group would have scored centred.                                                            |
| **Points lost to position**   | The part you would get back with a sight adjustment.                                                      |
| **Points lost to size**       | The part only tighter shooting recovers.                                                                  |

The split between position and size is the useful one: it separates a sight
problem from a technique problem, and they need different work.

## Helping it get better

**Settings → Keep My Marks as Training Data** is off by default. Turning it on
stores your marks — including the ones you corrected — on the phone, so that a
hole detector can eventually be trained on real targets.

Nothing is sent anywhere. The marks stay on your device, and you can delete
them.
