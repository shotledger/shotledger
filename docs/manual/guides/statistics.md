# Statistics

The **Statistics** tab is a form, not a dashboard. You describe which shooting
you want to look at, tap **Generate Report**, and the app works out the numbers
there and then. Nothing is stored, so you can ask a different question as often
as you like.

## The filters

| Filter               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **Sessions**         | The date range — last 30 days, 6 or 12 months, all time, or your own two dates.                |
| **Session Type**     | Training, competition, or both.                                                                |
| **Sighters**         | Whether sighting series count. See [How sighters count](../explanation/how-sighters-count.md). |
| **Discipline**       | One discipline, or all of them.                                                                |
| **Shots per Series** | Only series of that length, so five-shot and six-shot series are never averaged together.      |
| **Tags**             | Sessions carrying any of the tags you pick.                                                    |

The report repeats every filter at the top, so a report you exported or came
back to still says what it is about.

The count above the report is every session the filter matched, including a
session you logged as a round count with no series in it — those shots are in
the totals too. A fält session's stations count six shots each, scratched and
särskjutning stations included, since those rounds were fired. It therefore
agrees with the session count on Home.

The filters stay as you left them. Leave the tab and come back and the form is
still the one you built — it scrolls back to the top so you can see that, with
any open picker closed.

## The report

Below the filter, **In This Report** lists the sections this report holds,
each with the question it answers. Tap one to scroll straight to it.

- **Records** inside the filtered set: best session score, most inner tens, most
  tens. Tap one to open the session it came from.
- **Totals**, both as sums (all the points, all the shots) and as averages per
  shot and per series.
- **Charts** over time, one point per session, plus the shot distribution.
  Each discipline gets **its own line**, named in the legend below the chart. A
  precision session is out of 350 and a militär snabbmatch session out of 600,
  so drawing them as one line produced a saw-tooth that said nothing about
  either. The horizontal axis is real time, not one step per session — sessions
  that share a date sit on top of each other, which is the truth about them —
  and the labels name the year whenever the range crosses one. Past eight
  disciplines the chart says how many it left out rather than giving two of
  them the same colour.
- **Field Shooting**, when the report holds fält sessions: stations, hits,
  figures hit, the hit rate (hits out of six per station) and a chart of hits
  per station over time. Only stations that count are in it — a scratched or
  särskjutning station is not part of a result. Pick _Field Shooting_ as the
  discipline and the ring cards above are left out, since none of them can say
  anything about a fält round.
- **Training vs Competition**, when **Session Type** is _All_: training and
  competition side by side, with sessions, mean, median, best, SD and average
  X per series, and a line saying how far competition sits above or below
  training. Like is compared with like: one table per discipline and series
  length, and only where both training and competition have series. It counts
  the same series as the rest of the report, so the sighter setting applies.
- **Sighter and Result**, unless **Session Type** is _Training_: each
  competition's sighter against its match, one dot per competition and one
  card per discipline. From 10 competitions it says whether a better sighter
  goes with a better match, and how strongly. See
  [How sighters count](../explanation/how-sighters-count.md#does-the-sighter-predict-the-match).
- **Where Your Shots Land**, when sessions in the report were scored from a
  photo: their holes on one heat map, with a line on whether the points you
  lose are mostly a sight adjustment or mostly spread. See
  [What the group figures mean](../explanation/group-figures.md#across-sessions).
- **Export JSON**: the matched sessions and the summary as data. The file
  carries the filter — sighter setting included — alongside the numbers.

A **Shots per Series** filter leaves fält sessions out: a fält round has
stations, not series, so it has no series length to match.

## On the web

With sync on, **Statistics** in the web app shows the same report from the
same numbers. The filters sit in a column beside it and apply as you change
them, so there is no **Generate Report**. They stay as you left them while you
move between the web app's pages, and start afresh when you sign out or close
the tab. A record's session name opens that session.

The web report has no **Tags** filter, no **Export JSON** and no **Where Your
Shots Land** heat map; use the phone for those. A custom range whose **From**
is after its **To** matches nothing, and the page says so. Its dates are typed
as on [Enter Series](entering-series-on-the-web.md), or picked with the
calendar button.
