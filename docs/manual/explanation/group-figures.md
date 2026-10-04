# What the group figures mean

Once a series is [scored from a photo](../guides/scoring-from-a-photo.md), the
app knows where each hole is, not only what it scored. From those positions it
works out the group figures: windage, elevation, mean radius, max spread and
the points lost. They appear while you mark (from two holes), under the photo
of a scored series, in the session's **Group** view and in the session report.

All distances are millimeters on the target face.

## Where the group sits: windage and elevation

The group's center is the **mean point of impact**: the average position of
all its holes.

- **Windage** is how far that center sits right (positive) or left (negative)
  of the target's center.
- **Elevation** is how far it sits above (positive) or below (negative) it.

Together they are the size and direction of a sight correction, measured on
the target. The app does not turn them into clicks, because what one click
moves depends on your sight and the distance. With only a few shots, one wide
shot moves the center a long way, so take a correction from several series
rather than one.

## How tight it is: mean radius and max spread

- **Mean radius** is the average distance from each hole to the group's
  center. Every hole counts the same, so a single wide shot moves it only a
  little. It is the better measure of how consistent you were.
- **Max spread** is the distance between the two holes furthest apart, center
  to center. A single wide shot decides it on its own.

## Points lost

The app takes the group exactly as you shot it, moves it so that its center
sits on the center of the target, and scores it again. That gives three
figures:

| Figure              | What it is                                                                        |
| ------------------- | --------------------------------------------------------------------------------- |
| **Potential Score** | What the same group scores once centered.                                         |
| **To Position**     | Potential score minus your actual score: what a sight correction would give back. |
| **To Group Size**   | Maximum score minus potential score: what the spread costs even when centered.    |

So yes: **To Position** is roughly what you would have had with the windage
and elevation corrected, or by aiming where the error says. **To Group Size**
no sight adjustment recovers; only tighter shooting does.

An example: a five-shot series scores 43 out of 50. Centered, the same group
would score 47. Then 4 points are lost to position (47 − 43) and 3 to group
size (50 − 47). The split tells you which problem to work on: a sight problem
and a technique problem need different work.

### When it is only an estimate

- **It centers the average, not the best spot.** The app does not search for
  the shift that would score the most; it moves the group's average onto the
  center. Points lost to position is an estimate, not a guaranteed maximum.
- **A flier skews it.** One wide shot drags the average away from an otherwise
  tight cluster. Centering that average then pulls the cluster off center,
  and the potential score can come out _below_ what you actually shot. The
  app then shows 0 lost to position rather than a negative number. When the
  potential score is lower than your score, a flier is the reason; look at
  the group size figures instead.
- **X counts as a ten.** The potential score is ring points only.

## Across a session

The session's **Group** view pools every series scored from a photo into one
group. Sighters are left out, as they are from the session total. Its points
lost are for all those holes together, so the potential score is for the whole
session's marked shots, not one series. From 20 holes up, the view can switch
between the plot of every hole and a **heat map** that shows where they
cluster. A session shot on two faces, such as a full match of 25m Sport
Pistol, shows the face with the most marked holes.

## Reading the heat map

The heat map spreads each hole into a soft patch and adds the patches up, so
where holes crowd together the color builds. It runs from blue, where only a
stray or two landed, through green and yellow to red and white, where most of
your shots went. Ground nobody hit stays clear, so the rings and their numbers
show through. The colors are relative to the busiest spot on that target, not
a count: a white center means "most of them went here", whether that is 20
holes or 200. The same heat map appears in the session report.

## Across sessions

When the Statistics report covers sessions scored from photos,
**Where Your Shots Land** pools their holes for one discipline and face, the
one with the most marked holes, into a heat map. Under it, from 10 marked
shots, the app says which of the two causes costs you more:

- **Mostly a sight adjustment** when points lost to position are more than
  one and a half times those lost to group size.
- **Mostly consistency** when it is the other way round.
- **Position and spread cost about the same** when neither is that far ahead.
- **Centered and tight** when less than one point is lost in all.

It reads the holes only. It cannot see your grip, your sight picture or
whether the sights were simply set wrong, and it does not try to diagnose
technique.
