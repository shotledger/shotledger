# Scoring from a photo

Photograph the target, tell the app where the holes are, and it works out the
score from the target face's real dimensions.

This is **assisted** scoring — you mark the holes, the app does the geometry.
[What photo scoring does, and does not, do](../explanation/photo-scoring.md)
explains why it works that way.

It works on the 25 m precision and rapid-fire faces and the ISSF 10 m air
pistol face. For a session on any other target, **Add Series** goes straight to
the keypad.

Each series is scored on the face its stage is shot on. On a **Full Match** of
25m Sport Pistol or 25m Centre Fire Pistol, the precision stage uses the
precision face and the rapid-fire stage the rapid-fire face.

## How to do it

1. **Photograph the target.** Get the target face in frame, as square-on as
   you can manage. It does not need to be perfectly straight. On the 25 m
   precision face a close-up of the rings you hit is enough — the 9 and 10, say
   — as long as the center is in the photo: the app finds the target from the
   ring lines, so the edge of the black can be out of frame. On the rapid-fire
   face the app reads the ring lines of the center card: get the X, 10, 9 and
   8 in the photo, or at least three of them, with the center in frame.
   Finding the target takes a few seconds; the line under the spinner says
   which step it is on, and going back stops it.
2. **Place four points on a ring, if asked.** When the app cannot find the
   target by itself, drag the four handles to where a ring you can see crosses
   the top, right, bottom and left, and pick that ring under **Ring You Are
   Marking** — the app waits for that pick rather than assume the outermost
   ring. This is what lets the app undo the angle you photographed from.
   Once the ring is picked, the app draws it through your four points, marks
   the center they give, and draws the other rings faintly. They should all
   sit on the printed lines; if they miss, a handle or the ring you picked is
   off. A handle can go past the edge of the photo when that part of the ring
   is out of frame.
3. **Mark the holes.**
   - **Check the suggestions.** On the 25 m precision face the app also looks
     for the holes — whether it found the rings by itself or you placed the four
     points — and places a green, dashed mark on each one it is
     confident about. A one-line note on the photo says how many. It finds about three holes in four and is wrong about one
     mark in ten, so treat them as a head start, not a result: delete a dashed
     mark that is not a hole, drag one that sits off, and tap any hole it
     missed. A dashed mark scores exactly like one you placed. On a photo the
     app cannot make sense of, it says so and suggests none.
   - **Tap** a hole to mark it. A tap that lands within a few millimetres of a
     hole settles onto it, so close enough is good enough. Where the app cannot
     see a hole under your finger, the mark stays exactly where you tapped.
   - **Zoom** by pinching, or double-tap to zoom in on that spot; double-tap
     again to see the whole photo. The **−**, **+** and fit buttons in the
     top corner do the same. They never move; fit is greyed out while the whole
     photo is already in view.
   - **Pan** with one finger once you are zoomed in.
   - **Move** a mark by dragging it. A magnifier appears above your fingertip —
     beside it near the top of the photo — so your finger is not hiding the
     hole you are lining up with.
   - **Tap a mark**, or its value in the row under the score, to select it. The
     bar at the bottom then deletes it, calls it an X (inner ten), or — when the
     hole is within a millimetre of a line — lets you pick which value it gets.
     **Done** puts the ordinary bar back.
   - **Undo**, at the bottom, takes back the last change: an added, moved or
     deleted mark, an X, a call on a line, or a caliber change.
   - **Caliber**: the button beside Undo shows the caliber the marks are drawn
     for, taken from the session's firearm. Tap it to pick another.
   - **Retake** is in the **⋮** menu, for starting over with a new photo.
4. **Check the score**, then save it to the series. Once two or more holes are
   marked, the windage, elevation, mean radius and max spread are shown under
   the score as you go.
5. **Scan the next series.** Instead of Save, **⋮ → Save and Scan Next** saves
   this series and opens the camera for the next one, without going back to
   the session. In a full match it goes to the next series still empty, and
   once every other series is filled it is not offered. Otherwise it adds a
   new series after the last one; the new series is an ordinary one, never a
   sighter.
6. **Look at it later.** The marks and the group figures stay with the photo.
   Open the photo from the series and you see the marks drawn on the target,
   with the figures below it. The
   [session report](logging-a-session.md#session-report) puts every series'
   target and figures on one page to print or share.

## Getting a good photograph

- Even light beats bright light. Hard shadows across the face cost you more
  accuracy than a dim photo does.
- Fill the frame with the target. A target that occupies a quarter of the photo
  has a quarter of the detail to work with.
- Square-on is ideal but not required — the app corrects a moderate angle.

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
