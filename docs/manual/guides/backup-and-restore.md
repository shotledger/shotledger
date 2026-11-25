# Backup and restore

Everything lives on your phone. No account is required, nothing is uploaded
unless you turn on sync — which is the point, and which means **a lost phone is
a lost logbook unless you have a copy**.

**Settings → Backup & Data.**

## Making one

**Backup** asks what to include and where to put it:

- **Always included** — sessions, series, shots, firearms, ammunition,
  licences, tags, maintenance and settings.
- **Photos** — optional, and the reason a backup can be large. Includes target
  photos downloaded by sync, not only ones taken on this phone.

You can share the file through the usual share sheet, or write it straight into
a folder you pick, which is quicker when you back up regularly.

## Restoring

**Restore from Backup**, then pick a `.shotledger` file.

Restore **replaces everything on the device**. Before it does, the app takes a
backup of what is currently there, so a restore of the wrong file is
recoverable.

The app shows what the file contains — date, sessions, series, shots, firearms,
photos — before you confirm. Read it; that is the moment to notice you picked
last year's file.

Some files are refused before anything on the device changes:

- **One made by a newer version of the app.** Update the app and try again.
  A file from an older version restores and is brought up to date, except
  one made by a version from before 23 October 2026, which the app cannot convert.
- **One that is damaged, or does not look exactly like a file the app
  writes.** It is reported as not a ShotLedger backup.

A file made by an older version that still had the Vault restores normally.
The Vault part of it is ignored: that feature is gone, and nothing in the app
can open it any more.

When the restore is done, ShotLedger restarts by itself to load the restored
data.

### With sync turned on

A backup holds your logbook, not the state of sync. After a restore, the next
sync starts from scratch. It fetches everything the account holds, and it
sends nothing from the file on its own.

- **Anything the account already holds comes back as the account has it.** A
  session you changed on this phone and never synced before the backup is
  replaced by the account's copy, if the account has one. Sync before making a
  backup you mean to restore from.
- **Anything the account never had stays on the phone.** It is sent the next
  time you change it.
- Restoring a backup made under another account does not mix the two. The
  phone fetches the signed-in account's data and sends nothing from the file.

### When the server refuses a change

If **Account & Sync** says that changes were refused by the server, the server
found something in them it cannot store. That is a fault in the app, not
something you did. The server keeps the refused change aside: it is not on
your other devices or in the web app until it arrives fixed. Changing the same
entry again, on this phone, another device or the web app, sends a new
version; if that one can be stored, the refusal ends. If the line keeps coming
back, report it.

A refused change also holds back the changes that belong with it, so your other
devices never see half a session. While it does, **Account & Sync** shows
"n change(s) waiting on a refused change". For a session that means every
series, shot and station of it, and the session itself; for a firearm, its
licenses, groups, calibers, maintenance and sight settings, but not the
sessions shot with it. Deletions are never held.

- The server keeps the held changes until the refused change arrives fixed,
  is discarded, or until it or its session is deleted, from any device. Then
  it stores them all at once.
- Changes to that session from your other devices and the web app wait on the
  server too. They are not lost by signing out, restoring a backup or
  reinstalling the app.
- Both lines count the whole account: every device and the web app show the
  same numbers.
- When two devices change the same entry, the change that reached the server
  last wins. A held change counts from when it reached the server, not from
  when it is stored. A deletion always wins.

#### Discard a refused change

When no edit fixes a refused change, for example because only a phone you no
longer have holds it, you can discard it. **Account & Sync** lists each
refused change under the "refused" line: what it is (a shot, a series, a
license and so on), the session or firearm it belongs to when this device
knows it, and how many changes wait on it. "Not on this device" means
another device made it; you can still discard it here.

1. Open **Account & Sync**.
2. Tap **Discard** next to the refused change.
3. Read the confirmation and tap **Discard**.

Discarding deletes the refused change on all your devices, and any older
version of it the server stores. For a shot, a series or a station, the rest
of the session then syncs without it. Discarding a refused session or firearm
deletes it, together with everything that belongs to it. A firearm's round
count stays as it is.

The web app's **Account** page lists the same refused changes, and its
**Discard** works the same way. You need a connection: Discard is not
queued for later.

Other devices and the web app show the session as the server stores it: as it
was before the refused change, until the server stores the held changes. So
does this phone after you reinstall the app. Signing out keeps your logbook on
the phone, and a restore keeps what the backup holds. While you are signed out,
the phone fetches nothing and shows its own versions. Once it syncs again,
after a restore or when you sign back in to the same account, it shows what the
server stores of anything the server already had, but a new entry the server
only holds back, such as a new series in that session, stays on the phone as it
is.

## How often

Whenever losing what you have logged since the last one would annoy you. For
most shooters that is after a competition, or monthly.

!!! tip "Keep the file off the phone"

    A backup stored only on the phone protects you from a mistake in the app.
    It does not protect you from losing the phone.
