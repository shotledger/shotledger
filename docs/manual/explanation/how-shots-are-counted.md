# How shots fired are counted

Several screens tell you how many shots you have fired: **Shots Logged** on
Home and in the Statistics report, an ammunition lot's usage, a firearm's
**Rounds Fired** and **Rounds Since Maintenance**, the shooting log's
**Shots**, the JSON report and the count shown before you import a file. They
all count the same way, so they always agree.

## What counts

A session's shots fired are:

- every shot in every series, **sighters included**;
- for a series saved as a total only, such as a result imported from
  Webshooter, the number of shots that total was made of;
- the session's **extra rounds**, the unscored shots you logged as a number;
- **six for every fält station**, a scratched or shoot-off station included.

A shot counts here because it was fired, whatever it scored. That is a
different question from what counts towards a result: a sighter or a scratched
station never adds to your score — see [How sighters
count](how-sighters-count.md) — but its rounds still went through the gun and
out of the ammunition box.

## When the app does not know

A series imported from ShotLog is a total with no shot count, so the app does
not know how many shots it was. It counts **none** rather than guess. Add the
rounds as extra rounds on that session if you want them counted.

## Firearm counters and older imports

A firearm's counters are kept as running totals: logging, editing or deleting
a session moves them by the difference it makes. A series imported from
Webshooter only started counting in this version, so a firearm whose sessions
include such a series from before it reads lower than the sessions add up to.
