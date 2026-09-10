# Document vault — evidence report

Companion to `docs/specs/document-vault-spec.md`. Covers `shared/src/vault/**`
(old-coder gauntlet) and summarizes the routine app-layer work around it
(ordinary tests, no gauntlet).

## Gauntlet layer — `shared/src/vault/{envelope,types}.ts`

- **Tests:** `shared/src/vault/envelope.test.ts`, 15 cases covering the full
  behavior table (E1–E11 + E7b, an added boundary case at exactly the
  29-byte header length) plus one extra assertion for spec constraint N3
  (never returns plaintext on failed auth). Run: `pnpm exec vitest run
shared/src/vault`.
- **Coverage:** `pnpm coverage` (full repo) — 100% statements/branches/
  functions/lines across all gauntlet-covered `shared/` directories,
  `shared/src/vault/{envelope,types}.ts` included. 371 tests total (357
  pre-existing on `feat/m6-compliance` + 14 new envelope tests — the 15th,
  E7b, was added after the first mutation pass below).
- **Mutation:** `pnpm exec stryker run --mutate
"shared/src/vault/envelope.ts,shared/src/vault/types.ts"` (equivalent to
  `pnpm mutation`'s glob, scoped for a faster loop). First run: 29 mutants,
  74.07% score, 7 survivors — all in error-message/name string literals that
  the initial tests covered (via `toBeInstanceOf`) but did not assert the
  content of, plus two survivors in the length-boundary check that produced
  a same-_type_, different-_message_ error via a different code path
  (`sealed[0]` on a too-short array reads as `0`, which still isn't
  `ENVELOPE_VERSION`, so the mutated code still threw a
  `VaultEnvelopeFormatError` — just the wrong one). Fixed by asserting exact
  `.name` and `.message` strings on E4/E7/E8, plus adding E7b to lock the
  `< HEADER_BYTES` boundary specifically (not `<=`). **Final: 100.00%
  (27/27 killed, 0 survived).**
- **Known-answer vectors (E10a–E10c, E11):** generated independently with
  Python's `cryptography` package (`AESGCM`, OpenSSL-backed) — a different
  implementation than the Node WebCrypto (`globalThis.crypto.subtle`)
  provider these tests otherwise exercise. E10a reproduces the published
  NIST/McGrew GCM "Test Case 1" tag for an all-zero key/IV/empty-plaintext
  input, the standard sanity check that the AES-GCM wiring (byte order, IV
  length, tag length, tag placement) is not doing something subtly wrong
  that would still pass a self-consistent round-trip test. Generation
  commands (not committed as a script — run once, output copied into the
  test file verbatim):

  ```python
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  import binascii
  # vector 1: key/iv/pt all zero-length or zero-valued
  AESGCM(bytes(32)).encrypt(bytes(12), b"", None)
  # vector 2/3: see envelope.test.ts for the exact key/iv/plaintext inputs
  ```

## Crypto choice verification

`aesEncryptAsync`/`aesDecryptAsync`/`AESEncryptionKey` were confirmed to
exist in the **installed** `expo-crypto@57.0.2` package (not just its
published docs) by reading:

- `node_modules/.pnpm/expo-crypto@57.0.2.../expo-crypto/build/aes/aes.types.d.ts`
- `.../build/aes/index.d.ts`
- `.../build/aes/ExpoCryptoAES.d.ts` (native module surface: `EncryptionKey`,
  `SealedData`, `generateKey`, `importKey`, `encryptAsync`, `decryptAsync`)

Platform support per `expo-module.config.json` in the same package:
`apple` (`FileSystemModule`... — for `expo-crypto` itself: iOS/Android native
modules, plus a web fallback in `ExpoCryptoAES.web.ts`).

## Routine app-layer work (ordinary tests, documented here not in the spec)

- `app/src/platform/vault-crypto.ts` — `AesGcmProvider<AESEncryptionKey>`
  adapter over expo-crypto. Thin (delegates every call); jest-expo's
  auto-generated mock for `expo-crypto`'s AES module returns stub/undefined
  values (see `node_modules/expo-crypto/mocks/ExpoCryptoAES.ts` — its
  `encryptAsync`/`decryptAsync` mocks are `async () => {}`), so this adapter
  cannot be exercised with real ciphertext under jest; its tests instead
  assert the call wiring (right method, right argument shapes, IV/tag
  extraction from `AESSealedData`) with the mock. Real-device correctness
  relies on the same algorithm family already proven in the gauntlet layer
  above (AES-256-GCM) plus manual verification via the emulator screenshot
  flow (add → view a document, confirms decrypt-to-screen works end to end
  on a real Android build).
- `app/src/platform/vault-key.ts` — key lifecycle over `expo-secure-store`.
  Tested with a mocked secure-store (get/set/delete) for: first-run
  generates and persists a key; subsequent calls reuse the stored key;
  survives a `getItemAsync` miss after `setItemAsync` (simulates the
  "key present but read fails" edge some Android OEM Keystore bugs produce)
  by regenerating rather than throwing.
- `app/src/platform/vault-auth.ts` — biometric gate over
  `expo-local-authentication`. Tested with mocked `hasHardwareAsync`/
  `isEnrolledAsync`/`authenticateAsync` for: hardware+enrolled → prompts and
  gates on the result; no hardware → skips the prompt, gate passes with a
  `deviceUnsecured` flag surfaced to the UI (per task brief "graceful
  fallback when no biometrics enrolled" — `expo-local-authentication`'s own
  `authenticateAsync` already falls back to device passcode/PIN when
  biometrics fail or aren't enrolled but a passcode exists; this wrapper's
  own fallback only covers the case where _nothing_ is enrolled at all).
- `app/src/platform/vault-fs.ts` — directory/path helpers over
  `expo-file-system`'s new `Paths`/`Directory`/`File` API. Tested with the
  real (non-mocked) API against a temp-directory equivalent is not possible
  under jest-expo (no native FS); tested instead via a small in-memory fake
  implementing the same three methods this module actually calls
  (`ensureVaultDirectory`, `documentFile`, `indexFile`), asserting path
  construction only — the native read/write/delete calls themselves are
  exercised for real only on-device (emulator screenshot flow).
- `app/src/features/vault/vault-store.ts` — CRUD over the encrypted JSON
  index + per-document encrypted files. Tested with the crypto provider
  faked as identity (no-op encrypt/decrypt, since the crypto layer itself is
  already gauntlet-tested above) and `vault-fs.ts` faked as an in-memory
  filesystem — proves the index bookkeeping (add appends, delete removes
  both the index entry and the blob, list reflects current state) without
  re-testing AES-GCM.

## Android backup exclusion

See `app/plugins/withVaultBackupExclusion.js` and its comment header for the
exact mechanism (`android:dataExtractionRules`/`android:fullBackupContent`
manifest attributes + two generated XML resource files excluding
`files/vault/`). Verified by generating the Android project
(`expo prebuild`) and inspecting the emitted
`android/app/src/main/AndroidManifest.xml` and
`android/app/src/main/res/xml/{data_extraction_rules,backup_rules}.xml`
directly — see the "Android backup exclusion" section of the task report for
the exact generated XML.

## What this evidence does NOT claim

- No independent security audit of `expo-crypto`'s native AES-GCM
  implementation itself (out of scope — that's Expo's own test suite and
  upstream Apple/Android platform crypto libraries; this project's
  responsibility is not re-implementing AES-GCM, which it doesn't).
- iOS backup exclusion (`NSURLIsExcludedFromBackupKey`) is **not
  implemented** — flagged as a follow-up in the decisions log. No Mac
  is available to this agent to build/verify an iOS target at all (repo
  convention: Android first, iOS later, all code iOS-ready) and no current
  Expo module exposes that flag without a small custom native module or a
  `withDangerousMod` Xcode-project edit. The vault's iOS Documents-directory
  files are, until that follow-up lands, subject to standard iOS
  device-to-device/iCloud backup — encrypted at rest in the envelope either
  way, but the _files_ would travel with a backup on iOS today, unlike on
  Android.
