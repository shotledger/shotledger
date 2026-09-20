# License activity

Swedish firearm license applications ask your club to certify that you have
been active on the range. The app keeps that record from the sessions you are
already logging.

For what the requirement actually is, which of the two cases applies to you,
and what the app deliberately does not track, see
[How license activity is counted](../explanation/license-activity.md).

## Turning it on

**Settings → Compliance → Sweden (FAP 551-3)**. Left at **None**, none of this
appears — which is the right state outside Sweden.

The status then appears on Home and on every firearm: how many activities you
have logged in the window, and how many you need.

## Choosing your case

The app proposes one of the two cases from your firearms, and says why it chose
it. To overrule it:

1. **Settings → Compliance → Activity Requirement**.
2. Pick the case that applies to you.

Once you pick one it stays picked — adding, editing or deleting a firearm will
not move it again. Until then the setting follows your firearms.

If the proposed case looks wrong, read the reason line under it first: it
usually points at a missing detail on a firearm rather than at the case itself.
Firearms missing a weapon type, caliber or licence are flagged **Incomplete**
on the Firearms tab, and filling those in may move the proposal on its own.

## Checking a firearm's own criteria

Two of the form's boxes are about one gun rather than about you: applying for
an **additional handgun**, and **renewing a time-limited permit**. Those live
on the firearm, not on Home.

1. **Firearms → the firearm**.
2. Scroll to **Föreningsintyg criteria**.

Each criterion shows whether it is met, and the count behind it — one line per
year for the renewal criterion, because it is checked year by year. Only
sessions you logged **with that firearm** count, so if the numbers look low,
check that your sessions record which gun you shot.

A criterion you expected and cannot see is not being hidden: the app only shows
the additional-handgun box for a pistol or revolver marked **My Own**, and the
renewal box for a firearm whose most recent licence has an end date. [Which
firearms each one is shown
for](../explanation/license-activity.md#which-firearms-each-one-is-shown-for)
says what to fix.

## Getting it out

**Settings → Backup & Data** exports everything. A club-log **PDF export** is
what you hand to the förening, and a **JSON export** carries the same sessions
as data.

The PDF follows the preprinted personal shooting log a club issues, column for
column:

| Column            | What it holds                                         |
| ----------------- | ----------------------------------------------------- |
| Date              | when you shot                                         |
| Place             | the range                                             |
| Shooting activity | discipline and whether it was training or competition |
| Firearm used      | the firearm on the session, or _Not recorded_         |
| Attested by       | **left blank, to be signed by hand**                  |

Above the table is a short summary: a blank line for your name, the period the
log covers, the firearm if you exported for one, how many sessions and how many
shots, and the date it was generated. Every figure there is labelled, so a
reader who was not with you at the range can tell what each number is.

Two of those are worth explaining.

**Firearm used** is there because naming the firearm is what shows activity
_with a particular gun_ — which is what the additional-handgun and renewal
criteria turn on. A session with no firearm recorded says _Not recorded_
rather than being dropped: a six-month window that quietly loses rows loses
sessions that did count.

**Attested by** is deliberately empty. On a club log a row becomes evidence
when someone signs it, and only a person can do that. The app prints the ruled
column and leaves it alone.

!!! note

    The app does not know your name — it has no reason to store it — so the
    log prints a blank line for you to write it on, the same as the signature
    column.
