# Your account on the web

If you use sync, the ShotLedger web app lets you reach your account and your
sessions from any browser, including when your phone is lost or broken. It
reads what sync has already stored and changes nothing in your logbook.

Sign in with the email and password of your sync account, then open
**Account** in the menu on the left. Closing the tab signs you out of this
browser and leaves nothing behind.

## Sessions

**Sessions** in the menu lists every synced session, newest first, with its
date, discipline and match format, location, result and tags. On a narrow
screen the discipline, location and tags are left out.

Open a session's name to read it: its series and shots, the totals, notes,
firearm, ammo lot and tags, or for a fält session its stations. Nothing can be
changed there.

### Target photos

A series or station with an uploaded target photo shows it beside its shots.
A photo the phone has not uploaded yet shows as **Not uploaded**, and one that
is no longer on the server as **Missing**. If a photo could not be loaded, for
example because the connection dropped, it shows **Could not load** with a
**Retry** button. Shot marks are not drawn on the web.

To see photos side by side, tick **Compare** under each one you want, or use
**Select All Photos** for every photo in the session. You can pick photos from
several sessions, and the selection stays while you visit Statistics or
Account. Then choose **Compare Photos**: the photos are shown large in a grid,
each with its series or station result and session. **Remove** takes one out;
**Clear**, or **Clear All** on the comparison, empties the selection. The
selection is forgotten when you sign out, reload or close the tab.

## Signed-in devices

Every phone and browser signed in to the account, with when it signed in and
when it was last active. **Sign Out** next to a device ends its session; that
device has to sign in again before it can sync. Use it for a phone you no
longer have.

The list needs a recent sign-in. If it does not load, sign out of the web app
and sign in again.

## Photo storage

How much of your photo allowance the uploaded target photos use.

## Download everything

**Download** saves one zip with:

- `sessions.json` — every synced session, firearm and licence, in the same
  format as [Exporting sessions](exporting-sessions.md). The phone imports it.
- `photos/` — every uploaded target photo, one folder per session.

Each session carries its tags, as in the phone's own export.

A photo that cannot be downloaded does not stop the rest. The zip then lists
it in `missing.txt`.

## Delete account

**Delete Account** first shows what would be removed: synced rows, photos
and signed-in devices. **Delete** then removes the account and everything on
the server, and signs out every device. The logbook on your phone is not
touched. This cannot be undone, so download everything first if you want a
copy.
