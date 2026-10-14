# Statistics

The **Statistics** tab opens on your results. It works them out from your
sessions every time you look, for the filter at the top. Nothing is stored,
so you can ask a different question as often as you like.

## What the tab shows first

Under the title, a line names the period and how many sessions it holds:
_Last 6 months · 22 sessions_. Then:

- **Average per Series**, in large type. Under it, how it moved against the
  period of the same length just before: _+0.8 on the previous 6 months_.
  The earlier period keeps every other filter you set. With **Max** there is
  no earlier period, so there is no line; with no scored series in the
  earlier period it says there is nothing to compare with. Under the number,
  a chart of the average per series over time.
- **Mean / Shot**, **Shot SD** (the spread of single shots), **X %** and
  **Inner Tens (X)**. The X count is always shown, also when it is 0.
- **Shot Distribution**: how many shots scored each ring value, with the
  number of scored shots and inner tens under it. An X counts as a 10 here.
- **Sessions**, **Shots Logged** and **Competitions** for the filter. Home
  no longer shows these counts; with **Max** and no other filter they are
  your all-time totals.

Pick _Field Shooting_ as the discipline and the tab leads with the **Hit
Rate** and a chart of hits per station instead, since no ring figure says
anything about a fält round.

The **Records** button beside the title opens your personal bests and
year-to-year figures. **Compare Lots**, at the bottom of the tab, compares
ammunition lots.

## The filters

**Filters** at the top opens a sheet with the filters. A change applies at
once; **Close** takes you back to the results. Every filter that is not at
its default sits beside the button as a chip, such as _Competition_ or
_Precision_. Tap a chip to remove that filter, or use **Clear All** in the
sheet. Clearing leaves the period as it is.

| Filter               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **Sessions**         | The date range: last 30 days, 6 or 12 months, all time (**Max**), or your own two dates.       |
| **Session Type**     | Training, competition, or both.                                                                |
| **Sighters**         | Whether sighting series count. See [How sighters count](../explanation/how-sighters-count.md). |
| **Discipline**       | One discipline, or all of them.                                                                |
| **Shots per Series** | Only series of that length, so five-shot and six-shot series are never averaged together.      |
| **Tags**             | Sessions carrying any of the tags you pick.                                                    |

The session count is every session the filter matched, including a session
you logged as a round count with no series in it. Those shots are in the
totals too. A fält session's stations count six shots each, scratched and
särskjutning stations included, since those rounds were fired. A ring
session's shoot-off series counts in the shots fired the same way, and in no
score.

The filters stay as you left them while you move around the app. Come back to
the tab and it starts at the top again.

## The rest of the results

Below the counts, **In This Report** lists the sections further down, each
with the question it answers. Tap one to scroll straight to it.

- **Summary**: the records inside the filtered set, best session score, most
  inner tens and most tens. Tap one to open the session it came from.
- **Totals Across the Filter**: total score, series, tens, and the gold
  series when there are any.
- **Field Shooting**, when the results hold fält sessions: stations, hits,
  figures hit, the hit rate (hits out of six per station) and a chart of hits
  per station over time. Only stations that count are in it; a scratched or
  särskjutning station is not part of a result.
- **Training vs Competition**, when **Session Type** is _All_: training and
  competition side by side, with sessions, mean, median, best, SD and average
  X per series, and a line saying how far competition sits above or below
  training. Like is compared with like: one table per discipline and series
  length, and only where both training and competition have series. It counts
  the same series as the rest of the results, so the sighter setting applies.
- **Sighter and Result**, unless **Session Type** is _Training_: each
  competition's sighter against its match, one dot per competition and one
  card per discipline. From 10 competitions it says whether a better sighter
  goes with a better match, and how strongly. See
  [How sighters count](../explanation/how-sighters-count.md#does-the-sighter-predict-the-match).
- **Charts Over Time**: average points per shot and session score, one point
  per session.
- **Where Your Shots Land**, when sessions in the results were scored from a
  photo: their holes on one heat map, with a line on whether the points you
  lose are mostly a sight adjustment or mostly spread. See
  [What the group figures mean](../explanation/group-figures.md#across-sessions).
- **Export JSON**: the matched sessions and the summary as data. The file
  carries the filter, sighter setting included, alongside the numbers.

Every chart over time gives each discipline **its own line**, named in the
legend below it. A precision session is out of 350 and a militär snabbmatch
session out of 600, so one line for both would be a saw-tooth that says
nothing about either. The horizontal axis is real time, not one step per
session: sessions that share a date sit on top of each other, and the labels
name the year whenever the range crosses one. Past eight disciplines the
chart says how many it left out rather than giving two of them the same
colour. The axis numbers are rounded steps (40, 42, 44); the count axis of
**Shot Distribution** starts at zero.

A **Shots per Series** filter leaves fält sessions out: a fält round has
stations, not series, so it has no series length to match.

## One session against your usual form

Open a session and switch from **Series** to **Stats**. Under the session's own
figures, **Vs. Your Usual Form** sets this session against the 100 series you
shot before it in the same discipline and class. Sighters are left out on both
sides.

- A line in words says how the session went: _About usual_, _Better than
  usual_, _Clearly better than usual_, or the same for worse. See
  [How "usual form" is worked out](../explanation/usual-form.md).
- **Avg/Series** and **Avg/Shot** each have a bar. The grey mark is your usual
  average and the coloured mark is today's; the further apart they are, the
  further from usual you shot. The line below gives both numbers and the
  difference.
- **Expected Score** is what your usual series average adds up to over the
  number of series you shot today, next to what you actually scored.
- **Share of 10s** and **9 or Better** give the share of today's shots in each,
  your usual share, and the difference between the two.

With fewer than 100 earlier series, the comparison uses the ones there are and
says how many. Below 20 it still shows the numbers but does not say how unusual
the session was. With none, it says there is nothing to compare with yet.

## On the web

With sync on, **Statistics** in the web app shows the same results from the
same numbers, in the same order: the average per series with its trend and
chart first, then the detail, the shot distribution and the counts. The
filter bar stays at the top of the page as you scroll, with the period and
the session count at its end. **Filters** opens the same filters, tags
included, and a chip removes one, as on the phone. The filters stay as you
left them while you move between the web app's pages, and start afresh when
you sign out or close the tab. A record's session name opens that session. A
session's **Stats** view, with **Vs. Your Usual Form**, is on the phone only.

Above the report sits your license-activity status, when a profile is chosen;
see [License activity](license-activity.md#on-the-web).

The web has no **Export JSON** and no **Where Your Shots Land** heat map; use
the phone for those. A custom range whose **From** is after its **To**
matches nothing, and the page says so. Its dates are typed as on
[Enter Series](entering-series-on-the-web.md), or picked with the calendar
button.
