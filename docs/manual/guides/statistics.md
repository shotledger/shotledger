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
the totals too. It therefore agrees with the session count on Home.

The filters stay as you left them. Leave the tab and come back and the form is
still the one you built — it scrolls back to the top so you can see that, with
any open picker closed.

## The report

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
- **Export** as PDF or JSON. The JSON carries the filter — sighter setting
  included — alongside the numbers.
