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

## Changing the match format

Picked Full Match when you meant Free Format, or the other way round:

1. Open the session's **⋮** menu and choose **Edit Session**.
2. Pick the format under **Match Format** and tap **Save Changes**.

The series are laid out afresh for the new format, which is why this works
only until the first result: a shot, a photo waiting to be scored, or an
imported total. After that the row shows the format with a note that it can
no longer be changed.

## Series and shots

A **series** is a run of shots scored together — five shots in SPSF precision,
six in militär snabbmatch. A **shot** is one hole, worth whole points or
decimals depending on the program.

Tap a series to enter it. The keypad advances after each shot, so you are not
reaching for a "next" button between shots.

In precision, magnum precision and militär snabbmatch, the keypad marks a good
series as you finish it. Reaching the gold-series score turns the total gold
with a light buzz. Every shot in the 10 ring — 50 in a five-shot series — gets
gold rings and **Great Job!** A **perfect series** goes one further: every shot
an inner ten, or 10.9 with decimal scoring (54.5), and gets **Perfect Series!**
It plays only when you complete the series, never when you reopen one, and with
the phone's reduce-motion setting on you see only the text. In the session's
series list, each total sits on a gold bar that fills towards a full score —
solid at 50, with an extra ring for a perfect series.

## Sighters

Mark a series as a **sighter** from the series menu, and it stops counting
towards the session total. Its score is still shown, with an asterisk —
**45\*** — because a sighter is deliberately unscored rather than missing a
score, and what you shot is still worth seeing.

That is the rule inside a session. Across sessions it changes — see
[How sighters count](../explanation/how-sighters-count.md).

## Field shooting

Field shooting is not scored in rings, so it is logged in **stations** instead
of series. Pick **Fältskjutning** as the discipline — the app keeps the Swedish name in
English too, because that is what the rule book calls the event and the session asks one
extra question: whether the competition is run as **field** or **point field**.

Each station is six shots, and you record two numbers — hits, and how many
figures those hits landed in. Five hits in three figures reads **5/3**: you
missed one shot, or put two in the same figure. The session total shows
"26 hits in 22 figures", or one sum in point field, where every hit is a point
and every figure hit is another.

Where the organiser put out a **ringed figure**, turn on _Ringed Figure_ and
record the points you scored and what the figure was worth. There is no fixed
ring scheme in field shooting — organisers choose — so the app asks rather
than assumes. Those points never add to your result; they only separate two
shooters who are otherwise equal.

Two switches take a station out of the result without erasing it:

- **Scratched** — the station was annulled, for a broken rule or a safety
  breach. It stays in the round, struck through, and counts for nothing.
- **Shoot-off** — shot to separate equal results. It decides placement, never
  the score you recorded.

Both still count the six rounds you fired towards your firearm's round counter
and your ammunition, because you fired them.

## Reordering

Series can be dragged into a different order. Press and hold a series, then
drag: the row lifts above the others and the list shows where it will land.

This exists because you do not always enter series in the order you shot them
— a series entered late belongs where it happened, not at the end.

## Deleting a series

Swipe a series left to reveal the trash icon, then tap it. You are asked to
confirm before the series and its shots are removed.

## The stopwatch and sights

Two buttons sit above the series list:

- **Stopwatch** — opens over the session. It keeps running when you close it,
  because it is timing your session rather than the panel. The buttons work
  like a phone stopwatch: **Lap** and **Start**, then **Lap** and **Stop**
  while it runs, then **Reset** and **Resume** once stopped. Laps are listed
  under the buttons, newest first.
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

## Sharing or deleting a session from Home

On Home, swipe a session left to reveal two icons: share and trash. Deleting
asks you to confirm first.

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
