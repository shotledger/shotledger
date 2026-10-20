# Your account on the web

If you use sync, the ShotLedger web app lets you reach your account and your
sessions from any browser, including when your phone is lost or broken. It
reads what sync has already stored, and changes only what the phone could
change itself: a session you
[type in](entering-series-on-the-web.md),
[edit or delete](editing-a-session-on-the-web.md), sessions you
[edit in bulk](editing-many-sessions-on-the-web.md), and the settings below.

Sign in with the email and password of your sync account, or with a
[passkey](#passkeys) you have added, then open
**Account** in the menu: on the left, or along the bottom on a narrow screen,
as the phone's tabs are. Closing the tab signs you out of this
browser and leaves nothing behind: the sign-in lives only in that tab, with no
cookie. The server ends it 12 hours after you signed in, or at once when you
use **Sign Out**; a tab still open by then asks you to sign in again.

## Sessions

**Sessions** in the menu lists every synced session, newest first, with its
date, discipline and match format, location, result and tags. A name the app
made up ("Precision — 2026-09-23") is shown without its date, which the Date
column already gives. On a narrow screen the discipline, location and tags are
left out.

Open a session's name to read it, in the same order as on the phone: its name
as the page title, what it was and what it was shot with, then the result,
then the firearm, ammo lot, location and notes, then its series and shots, or
for a fält session its hits, figures and stations.

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

## Firearms

**Firearms** in the menu lists your firearms as the phone's Firearms tab does,
ordered by make: each with its weapon type and the same status lines for its
license, maintenance, missing details and license activity. Firearms you have
archived are under **Show Archived**.

Open a firearm to read it, in the same order as on the phone: its weapon type,
ownership, chambering and national register ID, its round count and
maintenance status, its own **License Activity** card and **Föreningsintyg
Criteria** with the date to log your next session by, then its calibers,
weapon groups, sight settings, licenses and maintenance log. What you have
switched off under **Settings → Features** is left out, as on the phone.

The web only shows your firearms. Adding or changing a firearm, a license,
maintenance or a sight setting, and archiving one, is done on the phone. The
phone's ammunition lots are not on the web.

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
- **Features**: which parts of the app you show (the phone's Settings →
  Features, see [Hiding features you don't use](hiding-features.md)).

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

## Passkeys

A passkey lets you sign in with your fingerprint, face or screen lock instead
of typing your password. It is kept by your browser, your phone or your
password manager, and can follow you to your other devices the way your saved
passwords do. Your password keeps working, so you are never locked out on a
device without one.

To add one, sign in with your password and choose **Add Passkey** under
**Passkeys**. Your browser asks you to confirm with your fingerprint, face or
screen lock, and the passkey is listed under the name of this browser. Add one
from each browser or password manager you use. **Remove** next to a passkey
takes it off your account; delete it from your browser or password manager
too.

To sign in with it, choose **Sign In with a Passkey** on the sign-in page.
Where the browser supports it, your passkey is also offered when you click
the email field.

Passkeys work only on the real ShotLedger web address, over a secure
connection.

The phone app uses the same passkeys. On the phone, open **Settings** >
**Account & Sync**. Signed out, **Sign In with a Passkey** under the password
field signs you in. Signed in, the **Passkeys** card lists your passkeys with
**Remove**, and **Add Passkey** saves one in your phone's password manager
under the name "ShotLedger app on Android" or "ShotLedger app on iOS". If the
phone says to sign out and in again, it is because a passkey can only be added
within a day of signing in. A phone without a screen lock, or without Google
Play services on Android, cannot use passkeys, and the card says so.

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
the server, passkeys included, and signs out every device. The logbook on your phone is not
touched. This cannot be undone, so download everything first if you want a
copy.

## Source code

ShotLedger is free software. **Source Code** in the profile menu at the top
right opens the source code of the app and the web app.
