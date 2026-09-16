# Statistics

The **Statistics** tab is a form, not a dashboard. You describe which shooting
you want to look at, tap **Generate Report**, and the app works out the numbers
there and then. Nothing is stored, so you can ask a different question as often
as you like.

## The filters

| Filter               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Sessions**         | The date range — last 30 days, 6 or 12 months, all time, or your own two dates.           |
| **Session Type**     | Training, competition, or both.                                                           |
| **Sighters**         | Whether sighting series count. See below.                                                 |
| **Discipline**       | One discipline, or all of them.                                                           |
| **Shots per Series** | Only series of that length, so five-shot and six-shot series are never averaged together. |
| **Tags**             | Sessions carrying any of the tags you pick.                                               |

The report repeats every filter at the top, so a report you exported or came
back to still says what it is about.

## Sighters count here — unless you say otherwise

Inside a session, a [sighter](logging-a-session.md#sighters) never counts. It is
not part of that day's result, and the session total, the series average and the
session's own Stats tab all leave it out.

Outside a session the rule is different: **a sighter is an ordinary series**.
Across months of shooting, a sighting series is just more shooting — it went
through the same gun at the same target — so the report counts it in the
averages, the standard deviation, the shot distribution and the records.

Switch **Sighters** to **Exclude** and the report leaves them out again, which
makes every figure agree with what each session screen shows.

Two things do not move:

- **Shots fired** always counts sighters, in both positions. You fired those
  rounds whatever you called the series, and the figure has to match your
  firearm's round counter and your ammunition use.
- The **guldserie** count never counts a sighter, in either position. That is a
  question about what you can claim for a märke, not about how you are shooting,
  and a provserie is not a counting series.

!!! note "Records can come from a sighter"

    With **Include** selected, a best session score or a most-inner-tens record
    can be set by a session's sighter — so the report's best session total can
    read higher than that session's own screen. Switch to **Exclude** if you
    want records to mean strictly what the session screens mean.

## The report

- **Records** inside the filtered set: best session score, most inner tens, most
  tens. Tap one to open the session it came from.
- **Totals**, both as sums (all the points, all the shots) and as averages per
  shot and per series.
- **Charts** over time, one point per session, plus the shot distribution.
- **Export** as PDF or JSON. The JSON carries the filter — sighter setting
  included — alongside the numbers.
