# ADR 0008: Backup bundles use a hand-rolled, uncompressed container

Status: accepted (2026-09-02)

## Context

`.shotledger` backup bundles need to hold a database file and optional
photos as one exportable file. The obvious shape is a zip. No zip library exists in the lockfile — `fflate`,
`jszip` and `adm-zip` were checked, zero matches — and hard rule 2
forbids adding a dependency without asking.

## Decision

Ship a **small hand-rolled, uncompressed container**
(`shared/src/backup/container.ts`): a magic header followed by
length-prefixed entries. This ships now rather than blocking the whole
backup feature on a dependency ask; revisit if a zip dependency is ever
approved.

Export: `VACUUM INTO` a temporary copy of the database (never the live
file), rewrite that copy's `series.photo_uri` to the bundle-relative
`photos/<id>.<ext>` path for the database+photos kind, count rows for
the manifest, then serialize the copy into the container.

Restore is a **full replace**: write an automatic pre-restore backup,
close the live `expo-sqlite` connection, overwrite the database file on
disk, restore photos into `Paths.document/backup-photos/`, rewrite their
paths via a short-lived connection. The app cannot reopen its own closed
database singleton in place, so restore ends by reloading the JS app
(`reloadAppAsync` from the `expo` package, behind
`app/src/platform/app-reload.ts`). Originally this was a manual "close and
reopen the app" prompt, on the mistaken belief that a reload needed
`expo-updates`; issue #780 replaced it.

Schema compatibility: the manifest records the tag and `when` of the last
Drizzle journal entry at export, and restore refuses a bundle unless both
match the running build's (`shared/src/backup/compat.ts`). Before 1.0 the
baseline is reset rather than migrated, so the tag alone (`0000_baseline`)
cannot tell two baselines apart, and the migration gate cannot bring a
bundle from another baseline up to date.

Restore turns photo entry names into file paths, so a bundle is refused
before anything is written unless every `photos/` and `sync-photos/` entry
is a plain `<id>.<ext>`, and the container rejects empty or duplicate entry
names and bytes after the last entry.

## Consequences

- Bundles are uncompressed, so file size scales directly with photo
  count and database size; there is no compression win to give up if a
  zip library is later approved.
- Restore ends with an app reload the user confirms in one tap; no
  `expo-updates` dependency (issue #780).
- The container carries its own `BACKUP_CONTAINER_FORMAT_VERSION`,
  independent of the database schema. Before 1.0 a layout change edits the
  format in place (hard rule 8) rather than reading both shapes.
