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
  (vault photo capture).
