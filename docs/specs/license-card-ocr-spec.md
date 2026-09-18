# Licence-card scan (on-device OCR) — spec

> **Amended (2026-09-16, issue #276).** The Vault was removed, and with it the
> "keep the scanned original" half of this spec: the scan now fills the licence
> fields and the image is deleted on every path. The recognition, parsing and
> form-prefill behaviours below are unchanged.

Scope: "Scan a physical license card", amended 2026-09-03
(`feat/licence-card-image`) to keep the scanned original by default and link
it to the licence it was scanned for — see "Storing and linking the original
photo" below. When adding a licence or a renewal to a firearm, the user can
photograph the physical Swedish `vapenlicens` card; the app reads it **on the
device** and pre-fills the licence form for the user to confirm field by
field. The Vault's own "add document" screen offers the same scan for the
Weapon license kind.

Routine app-layer work per CLAUDE.md (UI + a pure parser), so ordinary
vitest/jest tests rather than the old-coder gauntlet. Evidence:
`license-card-ocr-evidence.md`.

## Modules

| Module                                           | Responsibility                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `shared/src/licenses/card-parser.ts`             | Pure: recognised text → candidate field values                                                                      |
| `app/src/platform/text-recognition.ts`           | ML Kit wrapper + deletion of the scanned image                                                                      |
| `app/src/platform/text-recognition.web.ts`       | Web stub — reports `unsupported`                                                                                    |
| `app/src/features/licenses/scan-license-card.ts` | Pick → recognise → parse, plus `settleScannedLicenseImage` (keep/discard the original), every dependency injectable |
| `app/src/app/firearms/[id]/index.tsx`            | The licence form: scan actions, pre-fill, confirmation, "Show License Card"                                         |
| `app/src/app/vault/add.tsx`                      | The Vault's own Weapon-license + Photo scan, optional licence-record creation                                       |
| `app/src/app/vault/[id].tsx`                     | The reused document viewer, now with a "document not found" state                                                   |

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
  immediately. On a successful parse it is held (in `expo-image-picker`'s
  cache) only until the user presses Save, at which point it is either
  encrypted into the Vault or deleted — every path through
  `settleScannedLicenseImage` ends with the picker's cache copy gone. A
  refused vault gate also deletes it — the copy is lost rather than left in a
  plaintext cache.
- **Storing it in the vault is opt-OUT and gated** (amended 2026-09-03 — see
  "Storing and linking the original photo" below): the switch defaults to
  `true` (kept), and Save asks for the same biometric/passcode gate as the
  vault screen (`requestVaultAccess`) before the vault write runs. Turning
  the switch off skips the vault entirely — no gate prompt, straight
  deletion. The vault is never synced (see `document-vault-spec.md`); the
  `licenses.vault_document_id` pointer that links a licence to its document
  is an opaque UUID with no meaning off-device, so syncing that pointer
  leaks nothing.
- **Nothing is written to the database without confirmation.** The scan only
  fills inputs; the existing Save button is still the only writer, and the
  form shows "Recognition can be wrong. Check every field before saving."

## Storing and linking the original photo (2026-09-03)

Amendment per the maintainer's report: "we want the original picture as
well — shooting stores needs to see that." Two changes from the original
design above:

1. **Kept by default.** `settleScannedLicenseImage` (in
   `scan-license-card.ts`) replaces the inline vault-write that used to live
   in the firearm screen. Its `store` option defaults to `true` at every call
   site — the switch in both the firearm form and the Vault's own "add
   document" screen is now framed as an opt-**out** ("Keep the original card
   photo in the Vault"), not an opt-in. The gate, the encryption, and the
   final `deleteImage` of the picker's cache copy are unchanged from before;
   only the default flipped.
2. **Linked to the licence.** A nullable `licenses.vault_document_id` column
   (migration 0005) holds the id of the vault document created for that
   licence's scan, set at the same insert that creates the licence row (no
   separate update). **Why a DB column and not a field inside the vault's own
   encrypted index** (`VaultDocumentMeta`): the alternative — a
   `linkedLicenseId` on the vault document, found by decrypting and
   searching the whole index — would mean decrypting every document's
   metadata (including unrelated door-code/membership-card labels) just to
   answer "does this licence have a card", without the user ever asking to
   open the vault. A plain nullable text column on the already-decrypted,
   already-synced `licenses` row answers that instantly, with zero vault
   access, so the firearm screen can decide whether to offer "Show licence
   card" at all before ever calling `requestVaultAccess`. The id itself is
   opaque and — being local-vault-only — meaningless on a device that pulls
   the licence row via sync but lacks the matching vault document; that
   device simply doesn't offer the action (see "must show nothing broken"
   below).
3. **"Show License Card"** appears on a licence row only when
   `vaultDocumentId` is set. Pressing it calls `requestVaultAccess` (the same
   gate as the Vault screen) and, once granted, pushes the existing
   `/vault/[id]` document viewer — reused, not a new screen, but hardened
   with a "document not found" state (instead of hanging on its loading
   ellipsis) for the case a linked document is missing on this device — see
   "Surviving a backup/restore" below. A denied gate shows an inline message
   and does not navigate. A licence with no stored image (every licence
   created before this change, or one whose user opted out) simply has no
   action offered — nothing broken, nothing to explain.
4. **The Vault's own "add document" screen** (`app/src/app/vault/add.tsx`)
   gained the same scan when kind = Weapon license and content type = Photo.
   Scanning is strictly **additive** to the plain "Take photo"/"Choose from
   library" buttons already there: a failed, unsupported, or empty-parse scan
   never removes the ability to just store the photo (it only means no
   licence-record option is offered for that attempt). On a successful parse,
   an opt-in switch plus a firearm picker (hidden when the user has no
   firearms yet) lets the user additionally create a licence record —
   `addLicense` with `vaultDocumentId` set to the just-created vault
   document's id, in the same call shape as the firearm screen. Reuses
   `scanLicenseCard`/`card-parser.ts` unchanged — no second parser.

### Surviving a backup/restore

`vaultDocumentId` is an ordinary `licenses` column, so it round-trips through
the app's own backup bundles exactly like every other field on that row
(`shared/src/backup/container.ts`). A same-device restore therefore keeps a
licence pointed at the right document, and the Vault directory itself is
untouched by a restore — it is excluded from every backup bundle by design
(`docs/specs/document-vault-spec.md`), so it never needed restoring in the
first place. The only way "Show License Card" ever finds nothing is a fresh
install or a different device, where the Vault never held the file to begin
with — inherent to "the vault never leaves the device," not something this
feature could fix even with a different association mechanism. The
`/vault/[id]` viewer's "document not found" state (added alongside this
amendment) is what keeps that case from looking broken rather than something
that recovers the image.

## Out of scope

- **Only the Swedish Polisen layout.** Other jurisdictions' cards are a
  per-profile template later.
- **No perspective correction.** The photo-scoring pipeline
  (`app/src/features/photo-scoring/opencv.ts`) rectifies a _circular_ target
  face from an ellipse fit; a card needs quadrilateral detection and a
  different homography, which is a feature of its own. ML Kit tolerates
  moderate angles by itself, so the card is simply photographed flat.
- **No live/streaming camera scan.** A still photo from
  `expo-image-picker`, the dependency already in the app.
