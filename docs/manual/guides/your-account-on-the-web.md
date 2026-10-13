# Your account on the web

If you use sync, the ShotLedger web app lets you reach your account and your
sessions from any browser, including when your phone is lost or broken. It
reads what sync has already stored. It changes only two things: a session you
type in under [Entering series on the web](entering-series-on-the-web.md), and
the settings below.

Sign in with the email and password of your sync account, then open
**Account** in the menu on the left. Closing the tab signs you out of this
browser and leaves nothing behind: the sign-in lives only in that tab, with no
cookie. The server ends it 12 hours after you signed in, or at once when you
use **Sign Out**; a tab still open by then asks you to sign in again.

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

## Settings

**Settings** in the menu holds the settings that follow your account from
device to device, the same ones as on the phone:

- **Personal**: Birth Year, Your Class, and Women's Classes and Events
  (the phone's Settings → Personal).
- **Compliance**: the profile, and for Sweden the activity requirement that
  applies to you (the phone's Settings → Compliance). With no requirement
  chosen, the page shows the one worked out from your firearms, as the phone
  does. With no profile chosen yet, none is marked and your phone uses the
  one for its language; choose one here to store it for every device.

Change what you need, then **Save**. Changing a birth year that was already
set asks first, as on the phone. Your phones pick the change up on their next
sync. If the save does not reach the server, your changes stay on the page
and **Retry** sends them again; nothing is saved after the tab closes. If
you sign in again as another account, the page shows that account's settings
and your unsaved changes are not sent there.

Everything else in the phone's Settings — language, theme, Optional Fields,
timers, backups — belongs to each phone and is not on the web.

## Signed-in devices

Every phone and browser signed in to the account, with when it signed in and
when it was last active, to the minute, so two sign-ins from one browser can be
told apart. **Sign Out** next to a device ends its session; that
device has to sign in again before it can sync. Use it for a phone you no
longer have. A browser leaves the list by itself 12 hours after it signed in.

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
