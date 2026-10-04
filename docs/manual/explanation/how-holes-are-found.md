# How the app finds the holes

[Scoring from a photo](../guides/scoring-from-a-photo.md) is the task, and
[what photo scoring does](photo-scoring.md) is why it stops where it stops.
This page is what happens between taking the photo and seeing the dashed
marks, and where each step can go wrong.

## First it has to find the target

A hole is only worth a score once the app knows where the centre of the target
is, how many pixels make a millimetre, and how far the photo was tilted. It has
two ways to work that out on the 25 m precision face.

**From the edge of the black.** The black zone is a 200 mm disc. The app looks
for the largest dark, roughly round area in the photo and fits an oval to its
edge. The oval gives the centre, the scale and the angle you photographed from.
It then nudges the drawn rings until they sit on the printed ring lines.

**From the ring lines.** A close-up of the 9 and 10 has no black edge in it, so
the first method has nothing to hold on to. The second one uses a property of
the face instead: every ring line is a whole multiple of 25 mm from the centre.
The app finds the point that all the curved lines in the photo are centred on,
measures how far apart the lines are, and fits the rings to them. It never has
to read a ring number.

The ring lines of a milsnabb target can fool this second method. A close-up of
its X and 10 has the same 1:2 pattern as the precision face's, at twice the
size. So in a precision session the app makes three more checks before it uses
a fit from the ring lines. It refuses the fit if the rings only line up at a
slant that no photo of a flat target has. It refuses it if the milsnabb
target's own fit also works on the photo. And it refuses it if the holes come
out about half the size your caliber makes. When there are no holes to measure,
that last check cannot help. A milsnabb photo can then still get through,
mostly a tight close-up of the X and 10, so score milsnabb in a milsnabb
session.

Both are tried. Each one has to pass its own checks: the rings it draws must
sit on printed lines, to within half a millimetre. If both pass, the app uses
the one whose rings sit closer to the lines. If neither passes, it asks you to
place [four points on a ring](../guides/scoring-from-a-photo.md#how-to-do-it).

## Then it straightens the photo

With the target found, the app redraws the photo as if it had been taken
square-on, at a fixed four pixels to the millimetre. From here on a .22 hole is
always the same size in the picture, however near or far the phone was. Every
later step works on this straightened copy.

## Then it looks for holes

Finding the holes is two steps: first everything that might be a hole, then a
judgement on each.

**Everything that might be a hole.** A filter tuned to the size of the bullet
lights up round spots of about that size: bright ones on the black, where the
paper shows through, and dark ones on the white. A typical photo gives about
160 of them. That catches nearly every real hole, but most of the spots are
something else.

**A judgement on each one.** Each spot is measured about thirty ways. Torn
paper is rough and a patch is smooth. A patch or a printed digit has straight
edges, and a hole does not. A digit belongs to a long printed shape, and a hole
stands alone. The measurements go into a formula fitted on real targets, where
every hole had been marked by hand. The formula gives each spot a likelihood of
being a hole, and only the confident ones become dashed marks. Two marks closer
together than one hole are merged.

If the app finds far more holes than the series has shots, it has
misunderstood the photo. It then says so and suggests nothing, rather than
covering the target in marks for you to delete.

## Your tap gets the same help

A fingertip covers the hole it is aiming at. So when you tap, the app looks for
a hole within a few millimetres and moves the mark to its centre, but only if a
small hole-or-patch check agrees there is a hole there. Otherwise the mark
stays where you tapped.

## The score is taken from the hole's edge

The rule book counts a hole to the higher value as soon as it touches the ring
line (SHB F.6.10.1). So the app measures from the edge of the hole nearest the
centre, not from its middle: the distance to the centre minus half the bullet's
diameter, which comes from the caliber. A hole whose edge is within a
millimetre of a line is flagged, so you can make the call yourself.

## What still trips it up

- **Holes in the white**, and holes that touch each other, are the ones it
  misses most.
- **A heavily patched target.** Old patches are the commonest false hole, and
  a card that is more patch than paper hides the real holes too.
- **A centre card glued over a full target.** Two sets of ring lines can
  mislead the app about where the rings are, or how big they are. Check that
  the innermost drawn ring sits on the printed 10 before you trust the score.
- **Other faces.** All of this is measured on the 25 m precision face. On any
  other face you place the four points and mark every hole.

None of these is a threshold that could simply be turned. The next
improvement needs more real, hand-checked targets, which is what
[keeping your marks as training data](photo-scoring.md#helping-it-get-better)
is for.
