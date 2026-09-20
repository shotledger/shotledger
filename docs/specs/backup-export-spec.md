# Backup export scope and the vault opt-in — executable spec

> **Partly superseded (2026-09-16, issue #276).** The Vault was removed, so
> the vault opt-in, its passphrase re-wrap and the `vault/payload.enc` entry
> are gone. Everything else here — the container, the scope audit, the
> sync-photo namespace, restore's full-replace semantics — still holds, and a
> bundle written by a build that had the Vault restores with its vault section
> ignored.

Scope: `shared/src/backup/**` and the app glue that feeds it
(`app/src/db/backup/*`, `app/src/features/backup/*`,
`app/src/platform/backup-fs.ts`). Old-coder mandatory: this is data-loss- and
security-sensitive code — a wrong answer either silently drops user data from a
"backup" or writes photographs of weapon licenses into a file that leaves the
device.

**Spec approval: not obtained (autonomous run, per implementation-plan.md §0
rule).** This document is the artifact for the maintainer to review after the
fact. Evidence: `docs/specs/backup-export-evidence.md`.

**Isolation:** branch `feat/export-scope-vault-optin` off `origin/main`, in an
agent worktree.

The crypto envelope this builds on is specified in
`docs/specs/document-vault-spec.md` ("Envelope format"); that spec is unchanged
and still governs the vault at rest.

## Why this exists

The maintainer's requirement, 2026-09-03:

> Export data shall include everything except Vault per default (Vault is
> exported with warning if user explicitly wants it).

Two halves: make the default bundle genuinely complete-minus-vault, and make
the vault includable in a way that is both warned about and actually
restorable.

## Part 1 — what a default export contains (binding)

### Included

| Source                                                                                                                                                                             | How                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Every SQLite table — sessions, series, shots, shot marks, firearms, firearm groups, ammo lots, licenses, maintenance events, tags, session tags, **settings**, and the sync tables | `VACUUM INTO` a temp copy, `serializeAsync()` into `database.sqlite3`. One file, one entry — a table added later is included automatically |
| Series/target photos stored as local files                                                                                                                                         | `photos/<seriesId>.<ext>`, with the DB copy's `photo_uri` rewritten to that relative name so restore is location-independent               |
| Series/target photos stored as `shotledger-photo:<id>` sync markers                                                                                                                | `sync-photos/<photoId>.jpg`, **marker left alone** — see below                                                                             |

The settings table is the reason "everything except the vault" is nearly free:
language, theme, birth year, compliance profile, timer settings, the Webshooter
mock flag, the backup folder URI and `lastBackupAt` are all rows in it.

### The synced-photo gap this closes

`series.photo_uri` holds one of two things. A local path, or a
`shotledger-photo:<id>` marker that resolves through
`app/src/platform/sync-photos.ts` to `Paths.document/sync-photos/<id>.jpg`. The
shipped export called `readPhotoBytes(photoUri)` on both, so a marker was
opened as a file path, failed, and the photo was skipped: **a
"database + photos" bundle of a synced logbook contained no photos at all.**

Two namespaces rather than one, because the two behave differently on restore:

- a local photo's path is meaningless on another device, so the column is
  rewritten to the bundle-relative name and restore points it at the new copy;
- a sync marker is meaningful on _every_ device — it is the photo's identity.
  Rewriting it to a local path would fork the series away from the server's
  copy and re-upload it as a new photo. So the bytes are restored into this
  device's sync-photo cache under the same id and the column is not touched.

One sync photo can back several series; it is stored once.

### Deliberately excluded (binding — excluded on purpose, not by omission)

| Not included                                                           | Why                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The vault** (`Paths.document/vault/`)                                | The subject of Part 2 — off unless the user opts in                                                                                                                 |
| `Paths.document/pre-restore-backups/`                                  | Bundles of bundles. Including them would make each backup carry every previous one                                                                                  |
| `Paths.cache/**` (`backup-tmp/`, exported CSV/bundle/share-card files) | Derived and transient; the OS may delete them at any time                                                                                                           |
| The vault AES key (`expo-secure-store`)                                | Hardware-backed; it cannot leave the keystore, and exporting it would be exporting the vault with no protection at all                                              |
| The sync session token (`expo-secure-store`)                           | A credential. A backup file is not a credential store; the user signs in again after a restore                                                                      |
| A photo whose file has gone                                            | Counted in `counts.photosUnreadable` instead of failing the whole export. For a sync photo the server still holds it, so this is a gap in the bundle, not lost data |

**The sync tables (`sync_outbox`, `sync_state`, `sync_control`, `photo_queue`)
are included deliberately.** They live in the DB file, so excluding them would
mean actively stripping them. Keeping them is correct: the outbox holds local
mutations the server has not seen (dropping them would lose edits), `sync_state`
cursors are per-account rather than per-device, and a `photo_queue` row whose
local file is missing simply fails its upload attempt and is skipped. Restore is
a same-account disaster-recovery replace, which is exactly the situation those
rows are written for.

### License card images (PR #71)

`licenses.vault_document_id` points at a vault document holding the photograph
of a license card. Because the default bundle has no vault section, a restored
`licenses` row can carry an id for a document that is not present. That is a
dangling reference by design, not corruption: nothing validates the column, and
the viewer already renders a "document not found" state. The restore preview
says so in as many words (`backup.restorePreviewNoVaultNote`).

## Part 2 — the vault opt-in (binding)

### Mechanism: passphrase re-wrap — option (a) of the brief

The vault's AES-256 key is generated by `AESEncryptionKey.generate(256)` and
held in `expo-secure-store`, backed by the Android Keystore / iOS Keychain. It
never leaves the device **and cannot**. So copying vault ciphertext into a
bundle would produce a section that no other device — and not even the same
device after a reinstall — could ever decrypt. Option (b), shipping the key
alongside, was rejected: it makes the bundle exactly as sensitive as the vault
with nothing protecting it, and a bundle travels through share sheets, cloud
folders and mail. Option (c), refusing outright, is not needed: (a) is feasible.

Export therefore:

1. reads the vault index and every document, decrypting each with the **device**
   key **in memory** (`collectVaultPayload`);
2. packs index + documents into one payload — the same container format the
   bundle itself uses, nested (`packVaultPayload`);
3. derives a 32-byte key from the user's passphrase with PBKDF2-HMAC-SHA256 and
   a fresh random 16-byte salt;
4. seals the payload with AES-256-GCM under that key, using the **existing
   vault envelope** (`shared/src/vault/envelope.ts`) — the same reviewed native
   primitive the vault uses at rest;
5. writes salt, iteration count, KDF name and document count into the bundle
   manifest. **Never the passphrase, never the derived key, never the device
   key.**

Restore derives the same key from the passphrase the user types, opens the
section, and re-seals every document under **this** device's key.

### Where the KDF comes from

`expo-crypto` provides AES-256-GCM and CSPRNG bytes natively, but its only
hashing is `digest()` — async, whole-message, one native round trip per call.
An HMAC costs two of those, so PBKDF2 at any realistic iteration count would be
hundreds of thousands of bridge round trips. The KDF therefore has to run in
JavaScript.

It runs on **`@noble/hashes`** (`pbkdf2` over `sha256`), pinned as a direct
dependency of `shared/`: audited, zero-dependency, pure JavaScript, so it needs
no native module and works identically on Hermes, Node and the web build.
`shared/src/backup/pbkdf2.ts` is a thin wrapper that keeps this module's
parameter contract (a `RangeError` for every nonsensical iteration count or key
length, where noble answers a bare `Error` for two of them).

This is a hash and a key derivation function, not a cipher: **confidentiality
still rests entirely on native, reviewed AES-256-GCM.** A bug here cannot
weaken AES-GCM; the worst it could do is derive the wrong key bytes, which
byte-for-byte agreement with OpenSSL rules out.

The first implementation (PR #75) hand-wrote SHA-256, HMAC-SHA256 and PBKDF2 in
portable TypeScript, because no hashing library was then a direct dependency
and CLAUDE.md rule 2 forbids adding one unasked. The maintainer approved the
dependency afterwards and the hand-written `sha256.ts`/`pbkdf2.ts` were
deleted. The swap is like-for-like — same KDF, iteration count, salt handling,
manifest fields and envelope — and `kdf-compat.test.ts` holds golden vectors
captured from the deleted implementation, so bundles written before it still
restore (behaviors C1–C2).

Parameters (`vault-crypt.ts`, all recorded per bundle so they can be raised
later without breaking existing bundles):

| Parameter          | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| KDF                | `pbkdf2-hmac-sha256`                                                                             |
| Salt               | 16 bytes, fresh per export, from `expo-crypto`'s CSPRNG                                          |
| Iterations         | `VAULT_KDF_ITERATIONS` — see the evidence report for the on-device measurement behind the number |
| Derived key        | 32 bytes → AES-256                                                                               |
| Minimum passphrase | 10 characters, enforced in the UI                                                                |

Passphrases are trimmed of surrounding whitespace and NFC-normalized where the
runtime supports it, so the same passphrase typed on iOS and Android derives
the same key. A runtime without `String.prototype.normalize` skips
normalization rather than throwing.

### The warning (binding)

- The vault switch is **off** on every export; there is no remembered
  preference and no "always include" setting.
- Turning it on reveals a warning **on screen, in the dialog** — not in help
  text — naming what actually goes in: photographs of weapon license cards,
  membership cards, door codes.
- The user must tick an acknowledgement before the passphrase fields become
  editable, and confirm the passphrase twice before the export button enables.
- Turning the switch back off clears the acknowledgement and both fields.
- The passphrase is held in component state for the duration of one export and
  written nowhere.

### Restore rules (binding)

| Bundle                          | This device          | Result                                                                                      |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| No vault section                | vault present or not | Database (+ photos) restored; **this device's vault is untouched**                          |
| Vault section                   | any                  | Passphrase prompted before anything is written                                              |
| Vault section, right passphrase | empty vault          | Documents added, re-sealed under this device's key                                          |
| Vault section, right passphrase | vault has documents  | **Merged, never replaced** — see below                                                      |
| Vault section, wrong passphrase | any                  | Fails cleanly with nothing written; the user retries or chooses "Restore Without the Vault" |
| Vault section, user skips       | any                  | Database (+ photos) restored; vault untouched; status says the vault was skipped            |
| Newer schema                    | any                  | Refused before anything is written (unchanged, `compat.ts`)                                 |
| Truncated / not a bundle        | any                  | Refused with a distinct message (unchanged, `InvalidContainerError`)                        |

**Merge, not replace, and only for the vault.** The database restore stays a
full replace. The vault is the exception because a document that exists only on
this device — a license card photographed here and nowhere else — would be
destroyed unrecoverably by a replace. Documents are keyed by their uuidv7 id, so
an id already present is the same document and is overwritten (restoring the
same bundle twice is idempotent); every other id is added.

## Container compatibility (binding)

The container byte layout is unchanged, so `BACKUP_CONTAINER_FORMAT_VERSION`
stays `1`. The vault rides as one more named entry (`vault/payload.enc`) and
one **optional** manifest field. Consequently:

- a bundle written before this change validates and restores unchanged;
- a bundle written by this build parses in an older build, which strips the
  unknown `vault` field (zod's default) and ignores the entry it does not know.

New manifest counts (`syncPhotos`, `photosUnreadable`, `vaultDocuments`) are
optional for the same reason — a required field would have made every existing
bundle fail validation and report as "not a ShotLedger backup".

## Behaviors

### Hashing and KDF — `noble-hashes.test.ts`, `pbkdf2.ts`, `kdf-compat.test.ts`

H1–H7 pin the `@noble/hashes` primitives the KDF is built on: they are the
assertions that used to guard the hand-written implementation, kept so a
dependency bump has to reproduce them. (H4 and H8 tested the streaming and
pad-reuse internals of the deleted `Sha256`/`HmacSha256` classes and have no
counterpart in a library call.)

| #   | Scenario                                                                 | Expected                                                              |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| H1  | FIPS 180-4 published vectors (`abc`, empty, 448-bit)                     | exact match                                                           |
| H2  | Every input length 0–200 bytes, against OpenSSL                          | exact match at every length (block and padding boundaries)            |
| H3  | 200 randomized inputs up to 1000 bytes, against OpenSSL                  | exact match                                                           |
| H5  | 2 MB input (64-bit length field exercised beyond 16 bits)                | exact match                                                           |
| H6  | RFC 4231 HMAC vectors 1, 2 and 6 (including a 131-byte key)              | exact match                                                           |
| H7  | HMAC across key lengths 0–200 × message lengths 0–300, against OpenSSL   | exact match                                                           |
| K1  | RFC 7914 §11 PBKDF2-HMAC-SHA256 vectors (c=1 and c=80000)                | exact match                                                           |
| K2  | 40 randomized (password, salt, count, length) tuples, against OpenSSL    | exact match                                                           |
| K3  | Derived keys of 31/32/33/64/65/96 bytes (block boundaries)               | exact match                                                           |
| K4  | The exact parameters the app ships                                       | exact match                                                           |
| K5  | Zero, negative or fractional iterations; zero or negative key length     | `RangeError` naming the offending parameter — never weak key material |
| C1  | The pre-`@noble/hashes` implementation's derived keys, as golden vectors | byte-identical, including at the shipped 150 000 iterations           |
| C2  | A vault section sealed end-to-end by that implementation                 | opens and unpacks unchanged                                           |

### Vault section crypto — `vault-crypt.ts`

| #   | Scenario                                                                         | Expected                                                                                        |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| V1  | Seal then open with the same passphrase                                          | identical payload                                                                               |
| V2  | Wrong passphrase                                                                 | `BackupVaultPassphraseError`, no plaintext                                                      |
| V3  | Right passphrase, wrong salt                                                     | `BackupVaultPassphraseError`                                                                    |
| V4  | Right passphrase, wrong iteration count                                          | `BackupVaultPassphraseError`                                                                    |
| V5  | One flipped ciphertext bit                                                       | `BackupVaultPassphraseError` (AEAD gives no oracle distinguishing this from a wrong passphrase) |
| V6  | Truncated section                                                                | `VaultEnvelopeFormatError` — a format problem, not a passphrase problem                         |
| V7  | Two exports, same passphrase                                                     | different salt and different bytes                                                              |
| V8  | Sealed bytes and manifest fields searched for the passphrase and the derived key | neither present                                                                                 |
| V9  | Passphrase with surrounding whitespace                                           | opens with the trimmed form                                                                     |
| V10 | NFC vs NFD spelling of the same passphrase                                       | same key                                                                                        |
| V11 | Shipped iteration count                                                          | at or above the documented floor                                                                |
| V12 | Caller omits the iteration count                                                 | the shipped default is used and recorded                                                        |
| V13 | Runtime without `String.prototype.normalize`                                     | derives a key rather than throwing                                                              |

### Payload container — `vault-payload.ts`

| #   | Scenario                             | Expected                                           |
| --- | ------------------------------------ | -------------------------------------------------- |
| P1  | Index plus documents                 | round-trips exactly                                |
| P2  | Empty vault (index only)             | round-trips                                        |
| P3  | Empty document body and a 300 KB one | round-trips byte for byte                          |
| P4  | Payload with no index entry          | `InvalidContainerError`                            |
| P5  | Unknown entry from a newer build     | ignored, documents still read (forward compatible) |

### Bundle format — `bundle.test.ts`

| #   | Scenario                                                       | Expected                                                       |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| B1  | Default export                                                 | database + both photo namespaces present, **no vault section** |
| B2  | Opt-in export, right passphrase                                | the same documents come back out                               |
| B3  | Opt-in export, wrong passphrase                                | vault fails; database entry and counts still readable          |
| B4  | Byte-for-byte pre-vault bundle                                 | inspects, has no vault, schema check says `ok`                 |
| B5  | Truncated at four offsets                                      | `InvalidContainerError` at each — never a silent half-read     |
| B6  | Bundle from a newer schema                                     | `newer`, refused before anything is written                    |
| B7  | Corrupted vault section                                        | database still readable; vault rejects                         |
| B8  | Vault section and whole bundle searched for document plaintext | not present                                                    |

### Vault ↔ bundle transfer — `vault-transfer.ts`

| #   | Scenario                                                  | Expected                                                            |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| T1  | Opt-in with an empty vault                                | no section added                                                    |
| T2  | Two documents                                             | both collected with their metadata                                  |
| T3  | Index entry whose encrypted file is gone                  | skipped and counted; the payload's index lists only what it carries |
| T4  | Restore onto a device with a different key                | documents re-sealed under the target's key and readable there       |
| T5  | Restore onto a vault holding a document not in the bundle | that document survives                                              |
| T6  | Restoring the same bundle twice                           | replaced in place, not duplicated                                   |
| T7  | Payload document with no index entry                      | ignored                                                             |

## Negative constraints (must NOT happen)

- N1: `shared/src/backup/**` never imports `expo-*` or `react-native` — same
  constraint as every other `shared/` module.
- N2: no vault plaintext is ever written to disk outside the vault directory.
  The payload exists only in memory between decryption and sealing, and is
  zeroed after use.
- N3: the vault key, the derived key and the passphrase never appear in the
  bundle, the manifest, the database, a log line, or any settings row.
- N4: the vault is never included without an explicit per-export opt-in **and**
  an acknowledged warning — no remembered preference, no default-on path.
- N5: restore never deletes a vault document that was not in the bundle.
- N6: the Android auto-backup exclusion for `files/vault/`
  (`app/plugins/withVaultBackupExclusion.js`) is untouched, and the vault is
  still never synced — nothing here touches `app/src/db`.
- N7: `BACKUP_CONTAINER_FORMAT_VERSION` is not bumped, and no manifest field
  added here is required.

## Gauntlet plan

- `pnpm coverage` — coverage `include` extended to
  `shared/src/backup/{hex,pbkdf2,vault-payload,vault-crypt}.ts` at the same
  100/100/100/100 threshold as the other gauntlet-covered directories.
- `pnpm mutation` — `stryker.config.json`'s `mutate` glob extended to the same
  four files.
- `pnpm check` (typecheck, i18n parity, lint, format, vitest, jest).
- Device verification on an emulator: export without the vault, export with it,
  restore both onto a wiped app, and a deliberate wrong-passphrase restore —
  with synthetic vault documents only (hard rule 7).
- No property-based tests: the hash and KDF are checked differentially against
  OpenSSL, which is stronger than any property a test could assert about them,
  and the format's edge cases are a small enumerable set.
