# How sighters count

A [sighter](../guides/logging-a-session.md#sighters) counts differently
depending on where you are looking from, and the two answers disagree on
purpose. This page is why.

## Inside a session, and outside it

Inside a session a sighter never counts. It is not part of that day's result,
and the session total, the series average and the session's own Stats tab all
leave it out.

Outside a session the rule is different: **a sighter is an ordinary series**.
Across months of shooting, a sighting series is just more shooting — it went
through the same gun at the same target — so the report counts it in the
averages, the standard deviation, the shot distribution and the records.

Switch **Sighters** to **Exclude** and the report leaves them out again, which
makes every figure agree with what each session screen shows.

Two things do not move:

- **Shots Logged** always includes sighters, in both positions. You fired those
  rounds whatever you called the series, and the figure has to match your
  firearm's round counter, your ammunition use and the shooting log — see [How
  shots fired are counted](how-shots-are-counted.md).
- The **guldserie** count always counts a sighter, in either position. A 50 on a
  sighting series earns the märke exactly like any other series, so the filter
  has no say in it.

!!! note "Records can come from a sighter"

    With **Include** selected, a best session score or a most-inner-tens record
    can be set by a session's sighter — so the report's best session total can
    read higher than that session's own screen. Switch to **Exclude** if you
    want records to mean strictly what the session screens mean.

The **Sighters** filter on the [Statistics
tab](../guides/statistics.md) is where you choose between the two.

## Does the sighter predict the match?

The report's **Sighter and Result** card puts each competition's sighter next
to its match: one dot per competition, the sighter's average per shot across
and the match's average per shot up. Finals are left out of the match, because
only the top shooters shoot one. An ISSF match's stage sighters are pooled.
Training sessions are left out, and so are competitions without a sighter.

Each discipline gets its own card, because a milsnabb shot and a precision shot
average differently and mixing them would invent a relation. Under 10
competitions the card only says how many more it needs. From 10 it gives
Pearson's correlation **r**, from −1 to 1, and puts it in words. Under 0.1 the
sighter says little about the match. From 0.1 the relation is weak, from 0.3
moderate and from 0.5 strong. These are the usual rule-of-thumb cut-offs.

It shows whether the two **go together**, not that one **causes** the other. A
good day, the weather or the range can lift both the sighter and the match.

The card ignores the **Sighters** filter: the sighter is what it measures, and
the match never includes it.
