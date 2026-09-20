# Logging a session

A session is one visit to the range with one firearm. Inside it are series,
and inside those are shots.

## The session header

The top of a session names it and then, on one line, the date it was shot, its
type, your weapon group and class, the firearm and the competition. Your notes
follow underneath. Both matter most for a session you did not type in yourself:
an import carries its own date and puts its explanation — which firearm, why a
session is flagged for review — in the notes.

Under that are the session's tags. Tags the app wrote for itself look like
`shotlog:review` or `shotledger:championship`, with a prefix and a colon; those
appear here but are left off the Home and logbook lists, where your own tags
would otherwise be pushed out of sight. You can still filter the logbook by
them.

## Series and shots

A **series** is a run of shots scored together — five shots in SPSF precision,
six in militär snabbmatch. A **shot** is one hole, worth whole points or
decimals depending on the program.

Tap a series to enter it. The keypad advances after each shot, so you are not
reaching for a "next" button between shots.

## Sighters

Mark a series as a **sighter** from the series menu, and it stops counting
towards the session total. Its score is still shown, with an asterisk —
**45\*** — because a sighter is deliberately unscored rather than missing a
score, and what you shot is still worth seeing.

That is the rule inside a session. Across sessions it changes — see
[How sighters count](../explanation/how-sighters-count.md).

## Reordering

Series can be dragged into a different order. Press and hold a series, then
drag: the row lifts above the others and the list shows where it will land.

This exists because you do not always enter series in the order you shot them
— a series entered late belongs where it happened, not at the end.

## The stopwatch and sights

Two buttons sit above the series list:

- **Stopwatch** — opens over the session. It keeps running when you close it,
  because it is timing your session rather than the panel.
- **Sights** — the sight settings for this session's firearm, so you can
  record a correction between series without leaving the session.

Both are buttons rather than permanent panels: plenty of shooters bring their
own timer, and a panel nobody uses is a panel pushing the series list off the
screen.

## What the summary tells you

Under the series list:

| Figure                | What it means                                                       |
| --------------------- | ------------------------------------------------------------------- |
| **Total**             | Every scoring series added up. Sighters are excluded.               |
| **Series average**    | The mean series score, for comparing sessions of different lengths. |
| **Inner tens**        | How many shots landed in the inner ten.                             |
| **Inner ten average** | Inner tens per series.                                              |

For a championship format the total is split into **before final** and
**final**, because they are judged separately.

## Photographs

Any series can carry a photograph of its target. A series with a photo shows a
camera icon; tap it to see the picture, and from there you can score the series
from it — see [Scoring from a photo](scoring-from-a-photo.md).

Every photo you take also appears in the gallery under **Tools → Photos**,
where you can filter by discipline, firearm and weapon group.

## Finding a session again

Home shows your ten most recent sessions. **See all**, at the end of that list,
opens the full logbook — every session you have ever logged, newest first. It
sits at the bottom because that is where you are when the ten latest did not
have what you were looking for.

The logbook opens on the sessions themselves. Search is above them; everything
else is folded behind one **Filters** row, which shows what is currently
narrowing the list — so a filter is never working on you invisibly, and you are
never scrolling past six controls to reach a competition from a few weeks ago.

Filter by any combination of:

- **name** — free text, which ignores case and accents, so _traning_ finds
  _Träning_
- **when** — last 30 days, 6 or 12 months, all of it, or your own two dates.
  The same choices the [Statistics](statistics.md) tab offers, because it is the
  same question
- **training or competition**
- **discipline**
- **tag**
- **firearm**, including _No firearm recorded_ for sessions where none was set

Filters narrow together rather than widen: setting both _Competition_ and
_Milsnabb_ shows the sessions that are both. The count above the list always
says how many of your total you are looking at, so a filter that matches almost
nothing is visible as such rather than looking like an empty logbook.
