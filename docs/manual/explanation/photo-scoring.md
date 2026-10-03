# What photo scoring does, and does not, do

[Scoring a target from a photograph](../guides/scoring-from-a-photo.md) is the
task. This page is what the feature actually is, and why it stops where it
stops. [How the app finds the holes](how-holes-are-found.md) is what it does
between the photo and the suggestions.

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

The app looks for holes on the 25 m precision face, which is the face the
detector was measured on. It does so whether it found the target by itself —
from the edge of the black, or from the ring lines of a close-up — or you
placed the four points. On any other face you mark every hole.

## The rapid-fire face

On the rapid-fire face the app finds the target from the ring lines of the
center card stapled over the middle: the X, 10, 9 and 8. The card never sits
exactly on the face's own rings; on the photos the app was measured on it was
typically 1 to 2 mm off. Holes are scored on what is in front of them, so the
app follows the card. The 7, 6 and 5 rings it draws outside the card can
therefore miss the printed lines by a millimetre or two. A hole out there that
sits close to a line is worth checking against the printed line.

## Helping it get better

**Settings → Improve Automatic Scoring → Keep My Marks as Training Data** is off by default. Turning it on
stores your marks — including the ones you corrected — on the phone, so that a
hole detector can eventually be trained on real targets.

Nothing is sent anywhere. The marks stay on your device, and you can delete
them.

That is the whole of the ambition: not to ship a detector that guesses, but to
collect enough real, corrected marks that one could be trained honestly later.
