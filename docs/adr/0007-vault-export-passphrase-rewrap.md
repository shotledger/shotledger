# ADR 0007: Vault export uses passphrase re-wrap, not a raw ciphertext copy

Status: superseded (2026-09-16) by the removal of the Vault itself
(issue #276). The Vault, its export path and every module named below are
gone; `.shotledger` bundles no longer carry a vault section, and one written
by a build that did is restored with that section ignored. Kept for the
record — nothing here is current.

## Context

The Vault key is generated in and held by `expo-secure-store` (Android
Keystore / iOS Keychain) and cannot leave the device. A backup bundle
that simply copied Vault ciphertext into the export would produce a
section no other device — and not even the same device after a
reinstall — could ever decrypt. Since #71 the Vault also holds
photographs of weapon license cards, raising the stakes on getting this
right.

Three options were considered: (a) re-wrap under a passphrase chosen at
export time, (b) ship the device key alongside the ciphertext, (c)
refuse to export the Vault at all.

## Decision

**Option (a): passphrase re-wrap.** Export decrypts each document with
the device key in memory, packs index + documents into one payload,
derives a 32-byte key from the user's passphrase with
PBKDF2-HMAC-SHA256 (fresh 16-byte salt; iteration count and salt
recorded in the manifest, the passphrase itself never), and seals the
payload with the existing Vault AES-256-GCM envelope. Restore re-seals
every document under the receiving device's own key.

(b) was rejected because it makes the bundle exactly as sensitive as the
Vault with nothing protecting it, and a bundle travels through share
sheets, cloud folders and mail. (c) was rejected once (a) turned out
feasible.

Inclusion is **off on every export with no remembered preference**, and
the warning must be acknowledged before the passphrase fields become
editable. **Restore merges the Vault, never replaces it** — unlike the
database, which is a full replace — because a document that exists only
on this device would otherwise be destroyed unrecoverably; documents are
keyed by UUIDv7 id, so restoring the same bundle twice is idempotent. A
wrong passphrase is detected before anything is written.

The PBKDF2/SHA-256 implementation is hand-written
(`shared/src/backup/{sha256,pbkdf2}.ts`) because `expo-crypto`'s only
hashing is an async whole-message `digest()` — one native round trip per
call, so a realistic iteration count would mean hundreds of thousands of
bridge crossings — and no hashing library was a direct dependency at the
time (see ADR 0009, which records the later `@noble/hashes` swap).
Confidentiality still rests entirely on native, reviewed AES-GCM; the
hand-written code is a hash and a KDF, not a cipher, and is verified
byte-for-byte against OpenSSL and the published FIPS 180-4 / RFC 4231 /
RFC 7914 vectors.

The container byte layout is unchanged
(`BACKUP_CONTAINER_FORMAT_VERSION` stays 1, see ADR 0008): the Vault is
one more named entry plus one optional manifest field, so pre-Vault
bundles still restore and newer bundles still parse in older builds.

## Consequences

- A Vault-inclusive export is decryptable by anyone who has both the
  bundle and the passphrase — the passphrase, not the device, is the
  security boundary once exported.
- Restore's merge semantics (never replace) apply only to the Vault;
  the rest of the database restore is a full replace.
- `pbkdf2.ts` is under the Stryker `mutate` list, since it is
  hand-written crypto-adjacent code.
