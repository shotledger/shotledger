# Licence-card scan (on-device OCR) — evidence report

Companion to `docs/specs/license-card-ocr-spec.md`. Routine app-layer work
per CLAUDE.md (a pure parser plus UI/platform glue) — ordinary vitest/jest
tests, no old-coder gauntlet.

## 1. Source state and environment

| Item        | Value                                           |
| ----------- | ----------------------------------------------- |
| Branch      | `feat/license-card-ocr`, based on `origin/main` |
| Node / pnpm | v24.12.0 / 11.25.0                              |
| vitest      | 4.1.11                                          |

New dependency: `@react-native-ml-kit/text-recognition@2.0.0` (MIT), see the
2026-09-02 plan.md decisions-log entry and the spec's "Dependency" section.

## 2. Unit tests

| Module                                           | Test file                                             | Cases |
| ------------------------------------------------ | ----------------------------------------------------- | ----- |
| `shared/src/licenses/card-parser.ts`             | `shared/src/licenses/card-parser.test.ts`             | 36    |
| `app/src/platform/text-recognition.ts`           | `app/src/platform/text-recognition.test.ts`           | 5     |
| `app/src/features/licenses/scan-license-card.ts` | `app/src/features/licenses/scan-license-card.test.ts` | 12    |

`card-parser.ts` is a pure function (recognised text → candidate field
values); it is exhaustively tested with synthetic OCR text covering every
field, every label variant, diacritics/case noise, digit-lookalike repair,
date formats, "tills vidare", and the two bugs fixed on this branch:

- **Label/value pairs without a colon** (`readEntry` in `card-parser.ts`):
  a two-column card's OCR lines arrive as "Beslutsdatum 2026-01-15" —
  whitespace only, no separator. `readEntry` now tries the leading 1–3
  words as a label (longest first, since "Giltigt t.o.m." is two words)
  before falling back to "value on the next line". Covered by the "reads a
  label and value separated only by column whitespace" test, a 9-field
  synthetic card asserted field-by-field.
- **Caliber false positive**: the original `CALIBER_RE` matched the
  `.000` inside a licence number like `A000.000/2026-01` as a caliber
  reading (`.\s?\d{2,3}` with no boundary). Fixed by adding
  `(?<![\w.])` before the dot and `(?![\d./])` after the digits, so the
  dotted form only matches when it isn't preceded by a word/dot character
  or followed by more digits, a dot, or a slash. Covered by "does not read
  a caliber out of the licence number", asserting `caliber` is `null` for
  `Tillståndsnummer: A000.000/2026-01` (no other caliber-shaped text in the
  card).

`text-recognition.ts`'s `linesInReadingOrder` (pure geometry: ML Kit line
frames → visual reading order) is tested against synthetic line/frame
fixtures covering the two-column pairing, top-to-bottom ordering
independent of input order, non-overlapping rows, and the two fallback
paths (a line missing a frame, no lines at all).

`scan-license-card.ts` (pick → recognise → parse orchestration, every
dependency injected) is tested with faked `pickFromCamera`/`pickFromLibrary`/
`recognize`/`deleteImage` for: cancelled, denied, unsupported, failed engine,
a parse that found nothing (image deleted, `nothing` status), and a
successful scan (image kept, `scanned` result) — plus `countRecognizedFields`
and `licenseFormValues`'s current-value-preserving merge and the
"tills vidare" clears `validUntil` special case.

## 3. Full repo check

```
$ pnpm check
...
Test Files  92 passed (92)
     Tests  1310 passed (1310)
...
Test Suites: 18 passed, 18 total
Tests:       145 passed, 145 total
```

(`pnpm typecheck`, `pnpm typecheck:app`, `pnpm i18n:check`, `pnpm lint`,
`pnpm format`, vitest, and the app's jest suite all green.) A stale
`app/.expo/types/router.d.ts` from a previous typed-route generation was
deleted before this run, per the standing note in the task brief.

## 4. Device verification

AVD `shotledger2` (`emulator-5554`), Metro on port 8082, dev build installed
via `./gradlew assembleDebug -PreactNativeDevServerPort=8082` +
`adb install -r`.

**Synthetic card:** `app/src/features/licenses/__fixtures__/synthetic-license-card.png`
(committed with `5b70a0c`), a rendered mock of a Polisen `vapenlicens` card
with obviously fake values (`Test Testsson`, `A000.000/2026-01`,
`SE1234567`, red "SYNTETISKT TESTKORT — INTE ETT RIKTIGT TILLSTÅND" banner).
Pushed to the emulator's gallery with `adb push` to `/sdcard/Pictures/` plus
a `MEDIA_SCANNER_SCAN_FILE` broadcast.

**Flow:** Firearms & Ammo → an existing firearm ("Pistol Nine") → License →
"Choose a photo of the card" → system photo picker → the synthetic card →
recognition runs ("Reading the card…") → form pre-filled.

**Result: all 10 fields recognised** ("Recognised fields: 10." notice):

| Field                       | Card value                                  | Form value after scan                                                                         |
| --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| License number              | `A000.000/2026-01`                          | `A000.000/2026-01`                                                                            |
| Purpose                     | `Målskjutning`                              | `Målskjutning`                                                                                |
| Decision date               | `2026-01-15`                                | `2026-01-15`                                                                                  |
| Valid until                 | `Tills vidare`                              | _(empty — indefinite, per spec)_                                                              |
| Conditions                  | `Förvaras i säkerhetsskåp`                  | `Förvaras i säkerhetsskåp`                                                                    |
| Authority                   | `Polismyndigheten`                          | `Polismyndigheten`                                                                            |
| Make/model/caliber/vapen-id | `Testmake Testmodel`, `.22 LR`, `SE1234567` | summarised in the "Also update the firearm" line: `Testmake · Testmodel · .22 LR · SE1234567` |

The "Also update the firearm" opt-in switch and "Also store the photo in
the document vault" switch both rendered correctly (both off by default, as
specced). Nothing was saved — the flow was verified up to the pre-filled,
editable form; Save was not pressed (would have written a real, if
synthetic, licence row, which is not needed to prove the scan/parse/pre-fill
path).

No app-code bugs found during this pass — the reading-order fix, the two
parser fixes, and the field mapping all worked correctly on the first
end-to-end attempt.

## 4a. 2026-09-03 amendment: original kept by default, linked to the licence

Companion to the spec's "Storing and linking the original photo" section
(`feat/licence-card-image`). Routine app-layer work; ordinary vitest/jest
tests.

### Unit tests

| Module                                                                          | Test file                                             | Cases |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| `app/src/features/licenses/scan-license-card.ts` (`settleScannedLicenseImage`)  | `app/src/features/licenses/scan-license-card.test.ts` | +3    |
| `app/src/db/queries/licenses.ts` (`vaultDocumentId`, `setLicenseVaultDocument`) | `app/src/db/queries/licenses.test.ts`                 | +4    |
| `app/src/db/migrations.test.ts` (regression, unchanged assertions)              | `app/src/db/migrations.test.ts`                       | 0 new |

`settleScannedLicenseImage` is tested with fakes for `requestVaultAccess`/
`addPhotoDocument`/`deleteImage`, covering: the default-keep path (gates,
encrypts, then clears the picker's cache copy), the opt-out path (`store:
false` never calls the gate, just deletes), and a refused gate (deletes,
reports `vaultDenied`, no plaintext left behind). The licence queries test
`vaultDocumentId` defaulting to `null`, being set at `addLicense` time, and
`setLicenseVaultDocument` setting/clearing it on an existing row.

`app/src/app/vault/[id].tsx`'s new "document not found" state and the
firearm/vault screens' UI wiring have no jest coverage — this codebase does
not write RN component tests for screens (only for feature/query logic, per
every other screen in this repo); both are covered by the device pass below
instead.

### Migration

`app/src/db/migrations/0005_parallel_northstar.sql` — `ALTER TABLE licenses
ADD vault_document_id text`, generated via `drizzle-kit generate` (nullable,
no default, no backfill needed). `app/src/db/migrations.test.ts`'s existing
rehearsal test (apply 0000, insert a row, apply the rest) continues to pass
unmodified, confirming 0005 applies cleanly on top of a populated database.

### Device verification

AVD `shotledger4` (`emulator-5556` this run), Metro on port 8084, dev build
installed via `expo run:android --port 8084` + `adb install -r`. Demo data
loaded from `/dev` (`Load demo data`) for realistic firearms/licences;
synthetic card pushed to `/sdcard/Pictures/` as in §4 above.

**Flow 1 — firearm licence renewal, default-keep:** Firearms & Ammo → Pardini
K22 (had an existing 2024 licence) → Add renewal → Choose a photo of the card
→ synthetic card → 10 fields recognised. **"Keep the original card photo in
the Vault" was ON by default** with the hint "A gun shop needs to see the
actual card. Turn this off if you don't want the photo kept." → Save. The
device had no screen lock configured, so the vault gate's `deviceUnsecured`
path granted access without a biometric prompt (expected — see
`document-vault-spec.md`'s gate design). Result: the licence list now shows
**two** rows — the untouched 2024 licence (no action offered) and the new
2026 renewal with a **"Show License Card"** action, present only on the row
that has a stored image.

**Flow 2 — viewing the stored card:** tapping "Show License Card" re-gated
(silently, same reason) and pushed the existing `/vault/[id]` viewer, which
rendered the decrypted synthetic card full-screen — matching what was scanned
byte-for-byte (same fields, same "SYNTETISKT TESTKORT" banner).

**Flow 3 — vault's own "Add to vault" → Weapon license → Photo → Scan:**
`app://vault/add`, kind defaulted to Weapon license, content type Photo. The
plain "Take photo"/"Choose from library" buttons and a new, separate "Scan
Card" section (with its own "Take a Photo of the Card"/"Choose a Photo of the
Card" buttons) rendered together, confirming scanning is additive rather than
replacing the baseline picker. Scanning the synthetic card recognised 10
fields; toggling "Also create a license record from this scan" revealed a
firearm picker (Pardini K22 / Steyr LP10, the two demo firearms). Selecting
Steyr LP10 (which had no licence) and saving: the vault now listed both
documents ("Test vapenlicens" plus the earlier renewal's), and **Firearms &
Ammo now showed Steyr LP10 as "Valid"** instead of "No license" — its new
licence row carries the scanned fields (`A000.000/2026-01`, `Tills vidare`,
etc.) and its own "Show License Card" action, proving `vaultDocumentId` was
set correctly from this path too.

**Flow 4 — a missing linked document (the "document not found" hardening):**
deleted the vault document backing Steyr LP10's licence directly from the
vault list (Delete → confirm). Returning to Steyr LP10's licence and pressing
"Show License Card" (the action is unconditional — offered whenever
`vaultDocumentId` is set, not gated on the document's continued existence)
re-authenticated, then showed **"This document is no longer in the Vault on
this device."** with a "Go Back" button — the `/vault/[id]` screen's new
`notFound` state — instead of hanging on its loading ellipsis. This is the
scenario the spec's "Surviving a backup/restore" section names as the one
case the association can't paper over (a device whose Vault never had the
file), and confirms it fails gracefully rather than looking broken.

No app-code bugs found on this pass. One environment-only gotcha recorded for
future agents: this build's in-app LogBox "Open debugger to view warnings."
toast renders as an overlay directly on top of the vault add screen's Save
button at the bottom of the scroll view, silently swallowing taps intended
for Save until the toast is dismissed first — not a real defect (the button
itself is reachable and correctly wired; `uiautomator dump` bounds confirmed
the toast's `ViewGroup` and the Save button occupy the same screen region).

## 5. What this evidence does NOT claim

- **Only the synthetic card layout was exercised.** No real Polisen card
  (hard rule 7 forbids this) — real-card fidelity depends on ML Kit's
  recognition quality on an actual photograph (lighting, angle, print
  quality), not exercised here.
- **iOS was not verified** — no Mac available. The dependency's iOS side
  (`GoogleMLKit/TextRecognition` via the package's own podspec) was checked
  only by reading `node_modules`, not built.
- **Camera capture** ("Take a photo of the card") was not exercised on this
  pass — only "Choose a photo of the card" (library picker), since the
  emulator's virtual camera does not produce a readable card image. The two
  paths share every line of code after the picker returns a URI
  (`scanLicenseCard`'s `pickFromCamera`/`pickFromLibrary` both feed the same
  `recognize`/`parseLicenseCard` pipeline), so this is not a coverage gap in
  the parsing/pre-fill logic — only in `expo-image-picker`'s camera-launch
  call itself, which is a thin wrapper already used elsewhere in the app
  (vault photo capture). Same for the 2026-09-03 amendment's vault-add scan
  buttons — same picker wrapper, same gap, same reasoning.
- **The biometric gate itself was not exercised** — the emulator has no
  screen lock configured, so every `requestVaultAccess` call in this pass
  took the `deviceUnsecured` branch (access granted, no prompt). The gate's
  actual authenticate-or-deny behavior is unit-tested (`vault-auth`'s
  existing coverage) and was exercised end-to-end for the _denied_ case only
  indirectly, via the "document not found" flow, which re-authenticates but
  cannot distinguish "denied" from "granted but missing" without a real
  lock screen to refuse against.
- **A device restore was not physically exercised** (no second device/emulator
  available for this pass) — the "Surviving a backup/restore" reasoning in
  the spec is argued from the backup bundle's known format
  (`shared/src/backup/container.ts`, already covered by that feature's own
  evidence) plus the vault's own excluded-from-backup boundary, not from a
  fresh export/restore/reopen cycle run here. Flow 4 above exercises the
  resulting UI state (a dangling `vaultDocumentId`) directly instead.
