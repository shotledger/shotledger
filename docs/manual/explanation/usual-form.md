# How "usual form" is worked out

A session's **Stats** view compares it with how you usually shoot (see
[One session against your usual form](../guides/statistics.md#one-session-against-your-usual-form)).
This page explains what "usual" means there, and how the app decides whether a
session was unusual.

## What counts as usual

Your usual form is the **100 series you shot before this session**, in the same
discipline and the same class. Only sessions that started earlier count, so
adding a session today never changes what an older session says about itself.
Sighters are left out, as they are everywhere inside a session (see
[How sighters count](how-sighters-count.md)).

A series imported as a total only, with no single shots, counts towards the
series average and the expected score. It cannot count towards the shot
average or the shares of 10s and 9s, since the app does not know its shots.

## How unusual was today

Every shooter's series scores spread a little from one series to the next. The
app looks at how far today's series average is from your usual one, and
compares that with how much your series normally spread.

It also takes into account how many series you shot today. One good series can
easily be luck. Twelve good series in a row are much less likely to be, so the
same difference counts for more in a long session than in a short one.

| What it says              | Roughly how often an ordinary day lands here |
| ------------------------- | -------------------------------------------- |
| Clearly better than usual | about 1 session in 40                        |
| Better than usual         | about 1 session in 7                         |
| About usual               | about 2 sessions in 3                        |
| Worse than usual          | about 1 session in 7                         |
| Clearly worse than usual  | about 1 session in 40                        |

So "Better than usual" is a good day but not a rare one, and "Clearly" means
the difference is hard to put down to chance.

## When it says nothing

The app needs at least **20 earlier series** before it says how unusual a
session was. With fewer, it cannot tell your normal spread well enough, so it
shows the numbers and the count they are based on, and leaves the verdict out.
With no earlier series at all, it says there is nothing to compare with yet.
