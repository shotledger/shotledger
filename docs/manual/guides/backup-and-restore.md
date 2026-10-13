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

- **One made by a version with a different database layout.** Until
  ShotLedger reaches 1.0, a new version may change the layout without
  converting older backups. If the file came from a newer version, update the
  app and try again.
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

## How often

Whenever losing what you have logged since the last one would annoy you. For
most shooters that is after a competition, or monthly.

!!! tip "Keep the file off the phone"

    A backup stored only on the phone protects you from a mistake in the app.
    It does not protect you from losing the phone.
