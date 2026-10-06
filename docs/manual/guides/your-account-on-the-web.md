# Your account on the web

If you use sync, the ShotLedger web app lets you reach your account from any
browser, including when your phone is lost or broken. It reads what sync has
already stored and changes nothing in your logbook.

Sign in with the email and password of your sync account, then open
**Account** in the menu on the left. Closing the tab signs you out of this
browser and leaves nothing behind.

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

Session tags are not in the file: tags are not synced, so they exist only on
the phone that set them.

A photo that cannot be downloaded does not stop the rest. The zip then lists
it in `missing.txt`.

## Delete account

**Delete Account** first shows what would be removed: synced rows, photos
and signed-in devices. **Delete** then removes the account and everything on
the server, and signs out every device. The logbook on your phone is not
touched. This cannot be undone, so download everything first if you want a
copy.
