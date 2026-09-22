# What photo scoring does, and does not, do

[Scoring a target from a photograph](../guides/scoring-from-a-photo.md) is the
task. This page is what the feature actually is, and why it stops where it
stops.

## Assisted, not automatic

This is **assisted** scoring, not automatic scoring. The app does the
geometry, the ring boundaries and the arithmetic, and it suggests where the
holes are; you decide which marks stand.

The suggestions are a head start, not a result. On real club targets the app
finds about three holes in four and is wrong about one suggestion in ten, and
a series comes out entirely right about one time in three. Those are the
numbers behind the dashed marks, and they are why every one of them is drawn
so that you look at it. Finding holes is a genuinely hard problem on paper
targets: a repaired target's patches, the printed ring digits and the torn
paper around a double hole all look like holes at first glance, and a detector
that guesses silently would be worse than none, because you would end up
correcting more than you would have marked.

The app only looks for holes when it locked onto the target by itself. When
you placed the corners yourself it has no straightened picture to search, so
you mark every hole.

## Helping it get better

**Settings → Improve Automatic Scoring → Keep My Marks as Training Data** is off by default. Turning it on
stores your marks — including the ones you corrected — on the phone, so that a
hole detector can eventually be trained on real targets.

Nothing is sent anywhere. The marks stay on your device, and you can delete
them.

That is the whole of the ambition: not to ship a detector that guesses, but to
collect enough real, corrected marks that one could be trained honestly later.
