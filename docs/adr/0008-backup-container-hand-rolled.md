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
database singleton without a JS-reload dependency it doesn't have (no
`expo-updates`), so restore ends with a "close and reopen the app"
prompt rather than a live reload.

Schema compatibility refuses a bundle whose `schemaMigrationIdx` is
newer than the running build's own migrations
(`shared/src/backup/compat.ts`); an older bundle is silently brought up
to date by the existing migration gate on next launch.

## Consequences

- Bundles are uncompressed, so file size scales directly with photo
  count and database size; there is no compression win to give up if a
  zip library is later approved.
- Restore always requires a manual "close and reopen the app" step —
  tracked as a UX gap worth an `expo-updates` ask later, not solved
  here.
- The container carries its own `BACKUP_CONTAINER_FORMAT_VERSION`,
  independent of the database schema. Before 1.0 a layout change edits the
  format in place (hard rule 8) rather than reading both shapes.
