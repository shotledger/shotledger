# Backup export scope and the vault opt-in — evidence report

Companion to `docs/specs/backup-export-spec.md`. Branch
`feat/export-scope-vault-optin`, off `origin/main` at `4404b47`.

## What was audited, and what was actually missing

The audit question was: does a `.shotledger` bundle contain everything the app
persists, minus the vault? Every filesystem writer in `app/src` was enumerated
(`Paths.document` / `Paths.cache` call sites), alongside every table in
`app/src/db/schema.ts` and every key-value store in use.

**Result: one real gap, and one class of silent loss.**

1. **Synced photos were never in a bundle.** `series.photo_uri` holds either a
   local path or a `shotledger-photo:<id>` marker resolved by
   `app/src/platform/sync-photos.ts`. `export-bundle.ts` passed both to
   `readPhotoBytes`, which does `new File(uri)` — a marker is not a path, so
   the file did not exist, the photo was skipped, and the export reported
   success. For a synced logbook, a "database + photos" bundle contained **zero
   photos**. Fixed with the `sync-photos/` namespace (spec Part 1).
2. **Unreadable photos vanished without trace.** The `continue` on a failed
   read was correct — one missing file should not fail a whole export — but
   nothing recorded it. Now counted in `counts.photosUnreadable`.

Everything else was already covered, because it lives in the SQLite file that
`VACUUM INTO` copies wholesale:

| Checked                                                                                                                                                     | Verdict                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `settings` rows (language, theme, birth year, compliance profile, spoken prompts, fält-timer blob, WebShooter mock flag, backup folder URI, `lastBackupAt`) | in the DB file — included                                                                              |
| `tags`, `session_tags`                                                                                                                                      | in the DB file — included                                                                              |
| `firearms`, `firearm_groups`, `ammo_lots`, `licenses`, `maintenance_events`                                                                                 | in the DB file — included                                                                              |
| `shot_marks` (photo-scoring marks)                                                                                                                          | in the DB file — included                                                                              |
| `sync_outbox`, `sync_state`, `sync_control`, `photo_queue`                                                                                                  | in the DB file — included **deliberately** (rationale in the spec)                                     |
| Local series/target photos                                                                                                                                  | included (unchanged behaviour, path rewritten)                                                         |
| `Paths.document/backup-photos/` (photos restored by an earlier restore)                                                                                     | reachable through `series.photo_uri` as an absolute file URI — read and re-included                    |
| `Paths.document/vault/`                                                                                                                                     | excluded by default; opt-in (Part 2)                                                                   |
| `Paths.document/pre-restore-backups/`                                                                                                                       | excluded on purpose — bundles of bundles                                                               |
| `Paths.cache/**` (`backup-tmp/`, exported CSV / bundle / share-card files)                                                                                  | excluded on purpose — derived and transient                                                            |
| `expo-secure-store`: `vault_aes_key_v1`, the sync session token                                                                                             | excluded on purpose — the vault key physically cannot be exported, and a session token is a credential |
| Anything else on disk                                                                                                                                       | none found — the only `Paths.document` writers are backup-fs, vault-fs and sync-photos                 |

`licenses.vault_document_id` (PR #71) is a dangling reference after a
default restore, by design: nothing validates the column, the viewer already
has a "document not found" state, and the restore preview says the Vault is not
in the bundle.

## Gauntlet layer — `shared/src/backup/{hex,sha256,pbkdf2,vault-payload,vault-crypt}.ts`

- **Tests:** `sha256.test.ts` (8), `pbkdf2.test.ts` (5), `hex.test.ts` (5),
  `vault-payload.test.ts` (5), `vault-crypt.test.ts` (13), `bundle.test.ts` (8)
  plus the extended `types.test.ts` (M1–M6) and `photo-path.test.ts`. Run:
  `npx vitest run shared/src/backup`.
- **Coverage:** `vitest.config.ts`'s coverage `include` extended to the five
  files above, at the repo's existing 100/100/100/100 threshold. All five report
  100% statements / branches / functions / lines.
- **Differential verification instead of trusting the implementation.** The
  strongest evidence here is not the test count but that SHA-256, HMAC-SHA256
  and PBKDF2 agree **byte for byte with OpenSSL** (`node:crypto`, an entirely
  independent implementation) across:
  - every input length from 0 to 200 bytes — which walks the 55/56/64-byte
    padding and block boundaries where a hand-written hash goes wrong;
  - 200 randomised inputs up to 1000 bytes, and a 2 000 003-byte input (the
    64-bit length field beyond 16 bits);
  - HMAC over key lengths {0, 1, 32, 63, 64, 65, 100, 200} × message lengths
    {0, 1, 55, 56, 64, 65, 300} — the key-longer-than-block path included;
  - PBKDF2 over 40 randomised (password, salt, iteration count, key length)
    tuples, derived keys spanning one, two and three output blocks, and the
    exact parameters the app ships.

  Plus the published vectors: FIPS 180-4 (`abc`, empty, 448-bit), RFC 4231
  HMAC cases 1/2/6, RFC 7914 §11 PBKDF2-HMAC-SHA256 (c=1 and c=80000).

- **Mutation:** `npx stryker run --mutate "shared/src/backup/{hex,vault-payload,vault-crypt}.ts"`.
  First run: 89 mutants, **85.56%**, 13 survivors — six error-message/name
  string literals the tests caught by type but never by content, three in the
  `finally` that zeroes the derived key and the encoded passphrase (invisible
  from outside by construction), three on the empty-document-id guard in
  `unpackVaultPayload`, and one off-by-one on `hexToBytes`'s loop bound that no
  test could ever catch, because writing past the end of a pre-sized
  `Uint8Array` is a silent no-op. Fixed by asserting the exact `.name` and
  wording on the errors a user actually reads, adding P6 (an entry named
  literally `documents/` is dropped rather than restored as a nameless file),
  adding V14 (a capturing `importRawKey` plus a `TextEncoder` spy assert both
  buffers are all-zero after the seal — which turns spec constraint N3 from a
  claim into a check), and collecting `hexToBytes` into a plain array before
  converting, so an extra iteration changes the output length. **Final: 100.00%
  (83 killed, 5 timeouts, 0 survived).**

  This is why `sha256.ts` and `pbkdf2.ts` are **not** in the Stryker `mutate` list even
  though they are in the coverage list: a mutant anywhere in SHA-256 or PBKDF2
  is killed by construction — any change to the algorithm diverges from OpenSSL
  on the first vector — while mutating them would re-run the 80 000- and
  150 000-iteration cases per mutant, for hours, to prove something the
  differential tests already prove more strongly. `hex.ts`,
  `vault-payload.ts` and `vault-crypt.ts` _are_ in the mutate list.

## Routine app-layer work (ordinary tests, no gauntlet)

- `app/src/features/backup/vault-transfer.test.ts` — 7 cases (T1–T7) for the
  collect/install bookkeeping and, above all, the merge rule. The fake provider
  is keyed, so T4 can assert a restored document is sealed under the _target_
  device's key and not the source's.
- `app/src/db/backup/*`, `app/src/platform/backup-fs.ts` — thin IO around the
  bundle bytes; the format itself is covered by `bundle.test.ts`, which
  assembles and reads a bundle exactly as those modules do.
- UI (`backup-card.tsx`, `backup-options-dialog.tsx`,
  `restore-passphrase-dialog.tsx`) — manual device verification below.

## Whole-repo checks

- `pnpm check` — green (typecheck, `typecheck:app`, i18n parity at 678 keys in
  each of `en.json`/`sv.json`, eslint, prettier, 1404 vitest tests across 99
  files, 152 jest tests across 19 suites).
- `pnpm coverage` — every gauntlet-covered file at 100%, including the five
  added here. The one shortfall in the run is
  `shared/src/sync-client/photo-queue.ts` at 94.44% branches, which is
  pre-existing on `main` and fixed separately in PR #69 — not from this branch.

## Device verification

Emulator `shotledger4` (`emulator-5560`), Metro port 8084, dev build from this
branch. **Synthetic vault documents only** — no real licence data at any point
(hard rule 7). Sequence exercised:

1. Export with the Vault switch off (default) — photos on.
2. Export with the Vault switch on: warning shown, acknowledgement required
   before the passphrase fields unlock, passphrase confirmed.
3. Restore of the no-vault bundle onto a wiped app.
4. Restore of the vault bundle with the correct passphrase.
5. Restore of the vault bundle with a deliberately wrong passphrase.

### Results

All five steps behaved as specified. The bundles were also pulled off the
device and verified offline against the shared code, which is what makes this
more than a screenshot: the bytes that left the app were unpacked, the manifest
re-validated, and the vault section actually decrypted.

**Default export (Vault off).** Filename
`shotledger-backup-with-photos-2026-09-03.shotledger`; entries `manifest.json`
(481 B) and `database.sqlite3` (569 344 B) — **no `vault/payload.enc`, and no
`vault` field in the manifest**. Counts: 30 sessions, 216 series, 1080 shots,
2 firearms, 1 licence, 2 ammo lots, 3 tags, 1 maintenance event, `photos: 0`,
`syncPhotos: 0`, `photosUnreadable: 0`. Elapsed from tapping Back Up to the
share sheet: **2 s**.

**Opt-in export (Vault on).** The switch starts off; turning it on revealed the
warning, both passphrase fields stayed disabled and the Back Up button stayed
dimmed until the acknowledgement was ticked and the passphrase confirmed twice
(screenshots `dialog-default`, `dialog-vault-warning`, `dialog-filled`).
Filename `shotledger-backup-with-photos-vault-2026-09-03.shotledger`, entries
`manifest.json` (653 B), `database.sqlite3`, `vault/payload.enc` (497 B).
Manifest vault section: `pbkdf2-hmac-sha256`, 16-byte random salt, 150 000
iterations, 2 documents. Offline against the bundle:

- the wrong passphrase was rejected;
- the right passphrase produced both synthetic documents, ids and labels intact
  (`SynthLicenceA` → `SYNTH-DOC-A-0000`, `SynthDoorB` → `SYNTH-CODE-B-1111`);
- searching the **whole bundle** for `SynthDoorB` and `SYNTH-CODE-B-1111`
  found nothing — no vault plaintext anywhere in the file.

Elapsed to the share sheet: **10 s**, against 2 s for the same export without
the vault. The ~8 s difference is the KDF plus the seal, and it is the
measurement behind `VAULT_KDF_ITERATIONS = 150 000`: high enough to be a real
barrier, and tolerable as a one-off behind the dialog's "Working…" label on a
software-rendered emulator (`-gpu swiftshader_indirect`), which CLAUDE.md
already records as markedly slower than real hardware. The count is a manifest
field, so it can be raised later without invalidating any existing bundle.

**Restore, no vault in the bundle, vault present on the device.** The preview
read "The Vault is not in this backup, so licence card images stay as they are
on this device". After restoring, `files/vault/` still held the same three
files with their **original timestamps** — untouched, as specified.

**Restore, wrong passphrase.** The prompt showed the inline error "That
passphrase did not open the Vault section. Nothing has been changed — try
again, or restore without the Vault." and stayed open for a retry. The
`files/pre-restore-backups/` count was **1 before and 1 after**, proving the
destructive path never ran — the passphrase is checked before anything is
written.

**Restore, correct passphrase, onto an emptied vault.** Both documents were
re-created (fresh timestamps) and the index rewritten; a second pre-restore
backup appeared, so the destructive path ran exactly once. Status: "Restore
complete and the Vault merged — close and reopen the app". After a full app
restart, the Vault screen listed **SynthDoorB** and **SynthLicenceA**, both
decryptable with the device key.

### Not exercised on device

- **Synced photos.** The `/dev` demo data has no photos and this run had no
  sync account, so `photos`/`syncPhotos` were 0 in both bundles and the
  `sync-photos/` path was not walked on hardware. It is covered by B1 and by
  the `photo-path` tests. The same gap is recorded for the 2026-09-02 backup
  verification.
- **Restore onto a device with a _different_ vault key.** The emulator keeps
  its keystore key across an app data wipe of the vault directory, so the
  re-seal ran under the same key. T4 covers the differing-key case with a
  keyed fake provider.

### Unexplained, not attributed

The dev client showed "Open debugger to view warnings" twice, logged as
`ReactNativeJS: Error: undefined` with no stack, at app relaunch (09:03:15) and
when the system document picker opened the file (09:06:39) — not during any
backup, restore or vault operation, all of which completed. Recorded here
rather than ignored, but nothing in this branch's code path is implicated.

## Known limitations

- The vault payload is assembled and sealed **in memory**, so an opt-in export
  of a very large vault is bounded by available heap. The vault holds licence
  and membership cards — a handful of photos — so this is not a practical
  limit today; it is recorded because it would become one if the vault ever
  stored many large files.
- Restore still requires a full app restart (the pre-existing `expo-updates`
  gap recorded in the 2026-09-02 plan.md entry). The vault merge happens before
  that restart and is complete when the prompt appears.
- The passphrase is the only thing protecting an opted-in bundle. There is no
  recovery path, by design: the app cannot help a user who loses it, and the
  warning says so.
