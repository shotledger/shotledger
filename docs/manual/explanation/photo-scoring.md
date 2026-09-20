# What photo scoring does, and does not, do

[Scoring a target from a photograph](../guides/scoring-from-a-photo.md) is the
task. This page is what the feature actually is, and why it stops where it
stops.

## Assisted, not automatic

This is **assisted** scoring, not automatic scoring. You mark the holes; the
app does the geometry, the ring boundaries and the arithmetic.

It does not find the holes for you. That is a genuinely hard problem on paper
targets — a repaired target's patches look very much like fresh holes — and an
automatic detector that is wrong is worse than no detector, because you end up
correcting more than you would have marked.

## Helping it get better

**Settings → Improve Automatic Scoring → Keep My Marks as Training Data** is off by default. Turning it on
stores your marks — including the ones you corrected — on the phone, so that a
hole detector can eventually be trained on real targets.

Nothing is sent anywhere. The marks stay on your device, and you can delete
them.

That is the whole of the ambition: not to ship a detector that guesses, but to
collect enough real, corrected marks that one could be trained honestly later.
