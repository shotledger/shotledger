# Editing many sessions on the web

With sync on, the web app can change many sessions in one go: tag a whole
season, fix which firearm a run of sessions was shot with, or move sessions to
another location. Sign in, then open **Bulk Edit** in the menu on the left.

## Pick the sessions

The page lists every session, newest first. Narrow the list with **From**,
**To** and **Search** (a session's name, location or tags), then tick the
sessions to change. The box at the top of the list ticks or clears every
session shown. **From** and **To** take a date as on
[Enter Series](entering-series-on-the-web.md), with the same calendar button.

A change applies to the ticked sessions that the list shows. Sessions you
ticked and then filtered away are left alone.

## Choose the change

| Change          | What it does                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Add Tag         | Adds the tag to each session, case ignored (`km` adds `KM`). A name you have not used before becomes a new tag |
| Remove Tag      | Removes one of the ticked sessions' tags from each of them                                                     |
| Change Firearm  | Sets the firearm, or **None**                                                                                  |
| Change Location | Sets the location. An empty location clears it                                                                 |

**Change Firearm** moves the round counts with the sessions, as editing one
session on the phone does: each session's shots (sighters included), its
unscored extra rounds and six rounds for every fält station come off the old
firearm's round count and go on the new one's.

## Apply

**Apply** sends the whole change at once; it is either made completely or not
at all, and your phone gets it at its next sync. The page then says how many
sessions changed, and how many already were that way.

A session that was deleted on another device in the meantime is left out,
and the page says so. If it was being moved to another firearm, the round
counts can still include it, so the page names the firearms whose counts to
check with **Adjust Round Count** on the phone. A tag deleted on another
device in the meantime does not show on the sessions; the page says that
too.

Applying needs a connection. If the server cannot be reached, the button
becomes **Retry**, which sends exactly the same change again, so nothing is
changed twice. Changing the selection or the change first drops that copy,
and the next **Apply** reads your logbook again. Signing in to another
account in between drops it too, so it is never sent to the wrong account.
Closing the tab drops the change.

Apply reads your logbook again just before it sends, but a change made on
your phone at the same moment can still be lost, and so can the web's: the
later save of a session or a firearm wins. This matters most for round
counts. Saving series on the phone while a firearm change is waiting for
**Retry** can lose those rounds from the count, so let the web finish first.

One change can touch at most 500 rows. If it needs more, the page says how
many, and you tick fewer sessions and apply twice.

## Merge ammo lots

Below the list, **Merge Ammo Lots** does what **Merge Into Another Lot** does
on the phone (see [Firearms and ammunition](firearms-and-ammunition.md)).
Choose the **Duplicate** and the lot to **Keep**; each shows its caliber and
how many sessions it has. **Merge** asks first, then moves every session on
the duplicate to the kept lot and deletes the duplicate, in one change. The
kept lot's quantity and notes stay as they are.

Retry, signing in again and the 500-row limit work as above. A duplicate with
more than 499 sessions is too big for one change: merge it on the phone.
