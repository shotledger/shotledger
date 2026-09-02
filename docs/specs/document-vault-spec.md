# Document vault crypto envelope — executable spec

Scope: `shared/src/vault/**` (old-coder mandatory — this is a new addition to
the CLAUDE.md list of paths requiring the loop; the crypto envelope for the
v2 encrypted document vault is exactly the kind of code the maintainer will
not read line by line). The RN-side platform adapters
(`app/src/platform/vault-crypto.ts`, `vault-key.ts`, `vault-fs.ts`,
`vault-auth.ts`) and the UI/store (`app/src/features/vault/**`,
`app/src/app/vault/**`) are routine app-layer work per CLAUDE.md and get
ordinary jest tests, documented in the evidence report instead of this spec.

**Spec approval: not obtained (autonomous run, per implementation-plan.md §0
rule and the task brief).** This document is the artifact for the maintainer
to review after the fact, per the old-coder skill's autonomous-mode
provision.

**Isolation:** none — Tier 2/3 boundary (crypto correctness matters, but this
is on-device-only storage, not money/multi-user auth/concurrency), on branch
`feat/document-vault` off `feat/m6-compliance`, in an agent worktree.

## Why this exists

plan.md v2: "Encrypted on-device document vault (license, membership card) —
never synced." Benchmark: Shotlytic (iOS-only) stores license/membership-card
photos and door codes on-device, CryptoKit-encrypted, as its distinctive
feature. This module is the Android/RN equivalent of that primitive:
authenticated encryption for arbitrary bytes (photos, short text secrets),
with the key held outside app-controlled storage in the platform keystore.

## Crypto choice (binding — do not substitute)

**`expo-crypto`'s built-in `AESEncryptionKey` / `aesEncryptAsync` /
`aesDecryptAsync` (AES-256-GCM), added upstream in Expo SDK 55, present and
verified in the installed `expo-crypto@57.0.2`** (this repo's SDK 57 pin).
Confirmed by reading the installed package's own `.d.ts` files, not
documentation alone:

- `node_modules/expo-crypto/build/aes/aes.types.d.ts`
- `node_modules/expo-crypto/build/aes/index.d.ts`
- `node_modules/expo-crypto/build/aes/ExpoCryptoAES.d.ts`

Rejected alternatives and why:

- `react-native-quick-crypto` — third-party JSI native module, not
  Expo-maintained, heavier footprint (a Node `crypto` polyfill), and not
  needed once expo-crypto's native AES-GCM binding was confirmed to exist.
- Global `crypto.subtle` (Web Crypto) via Hermes — Hermes does not implement
  `SubtleCrypto` natively; nothing in Expo SDK 57 polyfills it globally, and
  expo-crypto's `aesEncryptAsync`/`aesDecryptAsync` already provide the exact
  same AEAD primitive through a documented, versioned Expo API instead of an
  unstable polyfill.
- Hand-rolled AES-GCM (pure JS) — forbidden outright by CLAUDE.md rule 2 ("no
  home-rolled ciphers" is the whole point of this spec).

**New dependency flagged prominently:** `expo-crypto ~57.0.2` is a **new
runtime dependency**, installed via `expo install` (SDK-pinned). It is an
Expo-maintained first-party module (same publisher/support tier as
`expo-sqlite`, already in the tree), native on iOS/Android, no transitive
JS crypto library pulled in.

Two more new dependencies for the surrounding vault feature (both flagged,
both Expo-maintained, both `expo install`-pinned to `~57.0.x`):

- `expo-secure-store` — holds the raw AES-256 key; backed by Android Keystore
  (hardware-backed on API 23+, `AES/GCM/NoPadding`, key never leaves
  Keystore) and iOS Keychain.
- `expo-local-authentication` — biometric/passcode gate on the `/vault`
  route.
- `expo-file-system` — also newly added as a **direct** dependency (it was
  already present transitively via `expo-image-picker`); used for the vault
  directory and the Android backup-exclusion path documented below.

## Key lifecycle (binding)

One AES-256 key per install, generated once, held only in `expo-secure-store`
(`app/src/platform/vault-key.ts`, ordinary app-layer code, not this spec):

1. On first vault access, check `expo-secure-store` for the key
   (`vault_aes_key_v1`, base64-encoded raw bytes).
2. If absent, generate via `AESEncryptionKey.generate(256)`, export via
   `key.encoded('base64')`, store with `setItemAsync`.
3. Every subsequent encrypt/decrypt imports the key via
   `AESEncryptionKey.import(base64, 'base64')`.
4. The key is never written to the app's SQLite DB, never included in CSV
   export, never logged.

`requireAuthentication` on the secure-store item is deliberately **not**
set: it has no graceful no-biometric-enrolled fallback on Android (hard
failure below API 23 / without enrollment) and would double-prompt against
the app's own `/vault` gate (`app/src/platform/vault-auth.ts`,
`expo-local-authentication`, which already handles the graceful-fallback
requirement from the task brief). The key is still hardware-backed by
Keystore/Keychain at rest; the biometric gate is a UX/screen-access control
layered above it, not the only thing standing between an attacker and the
key.

## Envelope format (binding)

`shared/src/vault/envelope.ts` — pure functions, no RN/Expo import (matches
every other `shared/` module, N1-style constraint below), parameterized over
an injectable `AesGcmProvider` so the format and its tamper-detection
behavior are provable with a standards-compliant AES-GCM implementation in
`vitest` (Node) without depending on a native module that only runs on
device.

```ts
interface AesGcmProvider<Key> {
  randomBytes(byteLength: number): Uint8Array;
  encrypt(
    plaintext: Uint8Array,
    key: Key,
    iv: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }>;
  decrypt(ciphertext: Uint8Array, tag: Uint8Array, key: Key, iv: Uint8Array): Promise<Uint8Array>;
}
```

Sealed (combined) binary layout — one file per document, no separate sidecar
needed for the crypto parameters:

```
byte 0        : envelope version (currently 1)
bytes 1..12   : IV / nonce (12 bytes, random per seal — never reused for a key)
bytes 13..28  : GCM authentication tag (16 bytes)
bytes 29..end : ciphertext (same length as plaintext; AES-GCM is a stream cipher, no padding)
```

`seal(plaintext, key, provider)`: generates a fresh random 12-byte IV via
`provider.randomBytes`, calls `provider.encrypt`, packs the four parts above,
returns `Uint8Array`.

`open(sealed, key, provider)`: parses the header, rejects unknown versions,
calls `provider.decrypt(ciphertext, tag, key, iv)` — **the provider is
expected to throw on authentication-tag mismatch** (this is what
`SubtleCrypto.decrypt`/native AES-GCM implementations do by contract); `open`
re-throws as `VaultTamperError` so callers can distinguish "corrupted /
tampered file" from other I/O errors.

## Behaviors — `envelope.ts`

| #   | Scenario                                                                                                                                                               | Expected                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Round trip: seal then open, any non-empty plaintext                                                                                                                    | `open(seal(pt))` returns bytes equal to `pt`                                                                                    |
| E2  | Round trip with empty plaintext (`Uint8Array(0)`)                                                                                                                      | succeeds, returns empty array (AES-GCM has no minimum-length requirement)                                                       |
| E3  | Two seals of the same plaintext with the same key                                                                                                                      | produce **different** ciphertext (random IV per call) — asserts the IV is not reused/derived deterministically                  |
| E4  | Tamper: flip one bit in the ciphertext region of a sealed envelope, then `open`                                                                                        | throws `VaultTamperError`, plaintext never returned                                                                             |
| E5  | Tamper: flip one bit in the tag region                                                                                                                                 | throws `VaultTamperError`                                                                                                       |
| E6  | Tamper: flip one bit in the IV region (envelope decrypted with the wrong effective IV)                                                                                 | throws `VaultTamperError` (GCM tag check fails since IV is authenticated data for the tag)                                      |
| E7  | Truncated envelope (fewer than 29 bytes — no room for version+iv+tag)                                                                                                  | throws a distinct `VaultEnvelopeFormatError`, not a generic crash                                                               |
| E8  | Unknown/future envelope version byte                                                                                                                                   | throws `VaultEnvelopeFormatError`, never attempts to decrypt with the wrong layout assumption                                   |
| E9  | `open` called with the wrong key (different key than sealed with)                                                                                                      | throws `VaultTamperError` (GCM authentication fails; this is indistinguishable from tampering by design — AEAD gives no oracle) |
| E10 | Known-answer test vectors (independently generated, see below) — `open()` on a hand-built envelope from fixed key/iv/ciphertext/tag decrypts to the expected plaintext | matches exactly                                                                                                                 |
| E11 | Known-answer test vectors — flipping any single byte of the fixed ciphertext/tag before `open()`                                                                       | throws `VaultTamperError`                                                                                                       |

## Known-answer test vectors (E10/E11)

Three vectors, independently generated with Python's `cryptography` package
(OpenSSL-backed, a different implementation than the Node `node:crypto`
WebCrypto provider `envelope.test.ts` otherwise uses for E1–E9), stored
verbatim in `shared/src/vault/envelope.test.ts`:

1. **Zero key, zero IV, empty plaintext, empty AAD** — reproduces the
   published NIST/McGrew GCM "Test Case 1" tag
   (16 bytes, hex `530f8afbc74536b9a963b4f1c4cb738b`), the standard sanity
   check for a from-scratch AES-GCM wire-up.
2. A short text-secret-shaped plaintext (`"Portkod: 4471#"`, a door-code
   example) with non-zero key/IV.
3. A 64-byte binary-shaped plaintext (simulating a photo-file chunk) with
   non-zero key/IV.

The envelope format has no additional-authenticated-data (AAD) field — every
vector above is generated and verified without AAD, matching
`AesGcmProvider.encrypt`/`decrypt`, which do not accept one. (`expo-crypto`'s
underlying `aesEncryptAsync`/`aesDecryptAsync` do support an `additionalData`
option; it is unused here — nothing in the vault's threat model needs
context-binding beyond the ciphertext itself, and adding an unused parameter
to the provider interface would be scope creep.)

Generation script (not committed — one-off, reproducible from the values in
the test file itself): `python3` with `cryptography.hazmat.primitives.ciphers.aead.AESGCM`,
run locally during this task; see the M-vault evidence report for the exact
commands.

## Negative constraints (must NOT happen)

- N1: `shared/src/vault/**` never imports `expo-*`, `react-native`, or any
  RN-only package — matches every other `shared/` module (compliance's N1).
- N2: `envelope.ts` never generates or derives an IV deterministically (no
  counter, no hash-of-plaintext) — always `provider.randomBytes(12)`.
- N3: no function in this module ever returns plaintext bytes without the
  provider's own authentication check having passed — there is no "decrypt
  without verifying" code path, even internally.
- N4: existing `shared/scoring`, `shared/disciplines`, `shared/compliance`
  test suites remain green and untouched (regression baseline).

## Out of scope for this spec

Key generation/storage (`vault-key.ts`, secure-store), the biometric gate
(`vault-auth.ts`, local-authentication), the vault directory/backup
exclusion (`vault-fs.ts`, file-system + the Android config plugin), the
document index/CRUD store, and every `/vault` screen. Those are routine
app-layer work, covered by ordinary jest/manual tests and documented in the
evidence report.

## Gauntlet plan

- `pnpm coverage` — `vitest.config.ts`'s coverage `include` extended to
  `shared/src/vault/**/*.ts`, same 100/100/100/100 threshold as the other
  gauntlet-covered directories.
- `pnpm mutation` — `stryker.config.json`'s `mutate` glob extended to
  `shared/src/vault/*.ts`, same break-at-95 threshold.
- `pnpm typecheck && pnpm lint` (existing layers, whole repo).
- No property-based tests: AES-GCM is a black box behind the provider
  interface here (its own correctness is established by the vector-based
  cross-implementation checks in E10/E11, not fuzzed); the format's edge
  cases (E4–E9) are a small enumerable set, covered by the table above.
