# Licence-card scan (on-device OCR) — spec

Scope: plan.md v2 "Scan a physical license card". When adding a licence or a
renewal to a firearm, the user can photograph the physical Swedish
`vapenlicens` card; the app reads it **on the device** and pre-fills the
licence form for the user to confirm field by field.

Routine app-layer work per CLAUDE.md (UI + a pure parser), so ordinary
vitest/jest tests rather than the old-coder gauntlet. Evidence:
`license-card-ocr-evidence.md`.

## Modules

| Module                                           | Responsibility                                         |
| ------------------------------------------------ | ------------------------------------------------------ |
| `shared/src/licenses/card-parser.ts`             | Pure: recognised text → candidate field values         |
| `app/src/platform/text-recognition.ts`           | ML Kit wrapper + deletion of the scanned image         |
| `app/src/platform/text-recognition.web.ts`       | Web stub — reports `unsupported`                       |
| `app/src/features/licenses/scan-license-card.ts` | Pick → recognise → parse, every dependency injectable  |
| `app/src/app/firearms/[id]/index.tsx`            | The licence form: scan actions, pre-fill, confirmation |

## Dependency

`@react-native-ml-kit/text-recognition@2.0.0` (MIT). Google ML Kit's
text-recognition v2 on both platforms: the Latin model is bundled in the
app binary and inference runs on the device — **no network call, ever**.
Android autolinks it (no config plugin, no extra Gradle settings); iOS pulls
`GoogleMLKit/TextRecognition` 8.0.0 through the package's own podspec.

## Field mapping

The parser targets the Polisen card layout. Everything it produces is a
_candidate_: the user sees it in an editable input and presses Save.

| `licenses` column (§3) | Card label(s)                                         | Rule                                                         |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `license_number`       | Tillståndsnummer / Tillståndsnr / Licensnummer        | `A123.456/2024-01` shape, normalised; year must be 19xx/20xx |
| `purpose`              | Ändamål                                               | verbatim                                                     |
| `decided_on`           | Beslutsdatum / Datum för beslut                       | → ISO `YYYY-MM-DD`                                           |
| `valid_until`          | Giltigt t.o.m. / Giltighetstid                        | → ISO, or NULL when the card says "tills vidare"             |
| `conditions`           | Villkor                                               | verbatim, wrapped lines joined                               |
| `authority`            | Myndighet / Beslutande myndighet, else a keyword scan | labelled value wins; otherwise `Polismyndigheten`            |

Also read off the same card, for the firearm row rather than the licence:
`make`/`model` (from `Fabrikat`/`Modell`, or split from a single `Vapen:`
line), `caliber` (`Kaliber`, else a shape scan for `.22 LR` / `9x19` /
`6,5x55`) and `vapen_id` (`SE` + 5–15 digits). These are applied only if the
user turns on the separate "also update the firearm" switch.

## Parser rules

- **Labels are fuzzy.** Compared after lowercasing, stripping diacritics and
  dropping punctuation, with a Levenshtein budget of one edit per five
  characters — so `ANDAMAL`, `Ändamål:` and `Beslutsdaturn` all land, while
  `Bxxxxxdxxxx` does not. Longest label first, so `beslutande myndighet` is
  not shadowed by `myndighet`.
- **A value may sit on the line below its label**, which is what ML Kit
  produces for a two-column card. A label line takes the next line only if
  that next line is not itself a label. `Villkor` keeps taking lines (it
  wraps); every other field takes at most one.
- **Digit lookalikes** (`O`→0, `I`/`l`/`|`→1, `S`→5, `B`→8) are repaired
  inside otherwise-numeric runs only: the licence number, the register id and
  dates.
- **Dates** accept `YYYY-MM-DD` and `DD.MM.YYYY` with `-`, `.`, `/` or a
  space; the four-digit group is the year wherever it sits, so no locale
  guess is needed. Calendar-checked (`2026-02-31` is rejected) and range
  checked (1900–2199).
- **"Tills vidare"** is matched fuzzily too (`Tilis vidare` passes) and means
  `valid_until = NULL` — reported separately from "not read" via
  `validUntilIndefinite`, so a real reading clears a stale typed value while
  a miss does not.
- **A field that cannot be read stays null.** Nothing is inferred from
  another field. An empty input the user fills in beats a wrong value they
  have to notice.

## Privacy boundary

- **The image never leaves the device.** ML Kit's bundled model runs locally;
  the app makes no network call anywhere in this flow, and the recognised
  text is held in component state only.
- **The photo is deleted as soon as its fate is known.** Recognition failure,
  an unsupported platform, or a parse that found nothing → deleted
  immediately. On success it is held (in `expo-image-picker`'s cache) only
  until the user presses Save, at which point it is either encrypted into the
  document vault or deleted. A refused vault gate also deletes it — the copy
  is lost rather than left in a plaintext cache.
- **Storing it in the vault is opt-in and gated**: the switch is off by
  default, and turning it on makes Save ask for the same
  biometric/passcode gate as the vault screen (`requestVaultAccess`) before
  `addPhotoDocument` runs. The vault is never synced (see
  `document-vault-spec.md`), so neither is the card.
- **Nothing is written to the database without confirmation.** The scan only
  fills inputs; the existing Save button is still the only writer, and the
  form shows "Recognition can be wrong. Check every field before saving."

## Out of scope

- **Only the Swedish Polisen layout.** Other jurisdictions' cards are a
  per-profile template later (plan.md).
- **No perspective correction.** The photo-scoring pipeline
  (`app/src/features/photo-scoring/opencv.ts`) rectifies a _circular_ target
  face from an ellipse fit; a card needs quadrilateral detection and a
  different homography, which is a feature of its own. ML Kit tolerates
  moderate angles by itself, so the card is simply photographed flat.
- **No live/streaming camera scan.** A still photo from
  `expo-image-picker`, the dependency already in the app.
