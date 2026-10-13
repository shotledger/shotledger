# A target photo on a series entered on the web — executable specification

> Old-coder SPEC for #691, a follow-up to the web series entry (#669, spec
> `docs/specs/web-series-entry-spec.md`, choice C4 "no photos"). Evidence
> report, once written: `docs/specs/web-entry-photo-evidence.md`. Decision
> record: ADR 0019 (web writes by pushing rows through `/sync/push`).
>
> **Approval status: NOT approved — written and built in one autonomous run;
> the key choices are listed in the PR for the maintainer.** The maintainer
> asked (2026-10-12) for every finding of verification round 1 to be fixed;
> R6–R10 in §8 record how. That is an instruction, not an approval of this
> spec.

- **Tier: 3.** It writes synced rows and stores bytes on the account. A series
  row that names a photo the server does not have makes every phone's
  download fail permanently for that photo (`photo-queue.ts`: 404 is
  `permanent`), and a photo that carries the picture's EXIF would publish the
  place it was taken.
- **Scope:** the web's Enter Series page (`web/src/entry/`, a new
  `web/src/photo-encode.ts`, one function in `web/src/api.ts`), a photo flag
  on a series draft in the shared builder
  (`shared/src/sync-client/{session-entry,rows}.ts`), one pure size helper in
  `shared/src/sync-client/photo-queue.ts`, an app test on the phone's schema,
  a backend round-trip spec, `docs/manual/` EN + SV, `app/src/i18n/{en,sv}.json`
  (`web.entry.*`). R8 adds one line to the upload route's quota admission
  (`backend/src/routes/photos.ts`).
- **Not in scope:** replacing or removing a photo on a saved session (editing
  is #692), photo scoring, marks, and a photo on any row the builder does not
  already write.

## 1. What the phone does (the behaviour mirrored)

Read from the code, not restated from docs:

1. A series keeps a photo in `series.photo_uri`. While the photo is only on
   the phone, that is a local `file:` path. The photo queue
   (`app/src/features/sync/photo-queue-runner.ts`) uploads it with the
   **series id as the photo id** (`reconcilePhotoQueue`: "the series id doubles
   as the photo id, which is what makes the upload idempotent across retries
   and devices"), then rewrites `photo_uri` to the marker
   `shotledger-photo:<series id>` (`toSyncPhotoUri`) and pushes that row.
2. Before uploading, `prepareSyncPhotoBytes` (`app/src/platform/sync-photos.ts`)
   re-encodes the picture as JPEG at quality `PHOTO_JPEG_QUALITY` (0.8),
   downscaling only, so that the longer edge is at most `PHOTO_MAX_EDGE_PX`
   (2048). It always re-encodes, a small picture included. Bytes over
   `PHOTO_MAX_BYTES` (1.5 MB, the server's cap) are not sent
   (`fitsPhotoSizeCap`; `photo_too_large`, permanent).
3. The re-encode writes no metadata: on Android `Bitmap.compress`, on iOS a
   `UIImage` re-encode. So the phone never uploads EXIF, GPS included. The
   original stays on the phone (ADR 0003: "originals never leave the device").
4. Upload is `POST /photos/upload/<photoId>` with `content-type: image/jpeg`
   and `content-length` (`createPhotoApi().upload`). The Worker accepts
   `image/jpeg`, `image/png`, `image/webp` (415 otherwise), refuses over 1.5 MB
   or over the quota (413, `photo_too_large` / `quota_exceeded`), limits
   uploads to 60 an hour (429), and re-uploading the same id replaces the
   object and nets only the size difference on the quota (`recordUpload`, P12).
5. A phone that pulls a marker it has no file for queues a download by photo
   id (`reconcilePhotoQueue`), stores it as `sync-photos/<photoId>.jpg` and
   shows it. A download answered 404 is `permanent`: the phone gives up on it.

## 2. Key choices (for the maintainer)

Each is my recommendation, with its alternative.

**C1. Upload first, push second; the push is never sent until every photo in
it is confirmed uploaded.** One Save: check the signed-in user (R14 of #669),
build the request, upload each photo, then push the rows in one request (C2 of
#669). A failure in between therefore leaves **photos on the server that no
series names yet**: they count against the account's photo quota (at most
1.5 MB each) and nothing shows them. Retry finishes the job (C3). If the user
instead edits the form or closes the tab, those photos stay orphaned on the
server until the account is deleted; nothing in the system deletes them.
_Alternative:_ push first with the marker, upload after. A failure in between
then leaves a series that names a photo the server never got: every phone's
download answers 404, which the photo queue treats as permanent, so the photo
is missing on every device with no way back from the web (editing is #692).
I do not recommend it: an orphaned photo costs quota; a dangling marker costs
the photo.
_Not done:_ deleting the uploaded photos when the user abandons a failed save.
After a lost push response the web cannot know whether the series landed, and
deleting would remove a photo a saved series names.

**C2. The photo id is the series id, as on the phone.** The builder writes
`photo_uri = shotledger-photo:<series id>` on a series whose draft row has a
photo, and the web uploads to that id. So a phone that later replaces the
photo overwrites the same object (P12 nets the quota) instead of orphaning
the web's, and the web's Retry reuses the same id.
_Alternative:_ a fresh photo id per picked file. It would work for display
but breaks the phone's invariant and orphans the web's object on replace.

**C3. Retry re-uploads only what was not confirmed, then resends the same
push.** The held request (C2 of #669) now carries the photos that belong to
it. A photo whose upload was answered 201 is not sent again; any other is
uploaded again to the same id, which the server's upsert makes safe (no double
quota). Then the identical push is resent, as before. What is held:

- **held** (Retry offered): no response, 5xx, 408 (`network`), 401
  (`unauthenticated`, with the inline sign-in), 429 (`photoRateLimited`: 60 an
  hour — Retry later works);
- **dropped** (the next Save builds anew): 413 `quota_exceeded`
  (`photoQuota`), 413 `photo_too_large` (`photoTooLarge`), any other status
  (`unknown`). Retrying these cannot succeed; the user removes a photo (an
  edit) and saves again.
  Any edit to a photo (add, replace, remove) drops the held request, like any
  other edit (U3 of #669). Adding a blank row still keeps it (R21 of #669).

**C4. Size, type and resize: the phone's numbers, in the browser.** The file
picker takes any image (`accept="image/*"`). When a file is picked, the page
decodes it (`createImageBitmap`, which applies the EXIF orientation, as the
phone's decoders do), downscales it so the longer edge is at most 2048 px
(never upscales), and re-encodes it as JPEG at quality 0.8 on a canvas — the
phone's `prepareSyncPhotoBytes`, with the same shared constants and a shared
pure size function (`scaledPhotoSize`). The result is what is shown, held and
uploaded; the picked file itself is never sent. A picture the browser cannot
decode (for example HEIC outside Safari) is refused at pick time ("cannot be
read"). A re-encoded photo over 1.5 MB is refused at pick time
(`fitsPhotoSizeCap`), as the phone refuses it before upload. No other input
limit: the phone has none either.
_Alternative:_ upload the picked file as it is (PNG, WebP accepted by the
server). I do not recommend it: it would send the original with its metadata,
and the phone stores every downloaded photo as `.jpg`.

**C5. EXIF and location are stripped by construction.** The canvas re-encode
writes a bare JPEG: no EXIF, no GPS, no camera data — what the phone's
re-encode produces (§1.3). The privacy page's statement "a session you enter
there is stored as sync stores one from the phone" stays true, and the manual
says the photo is resized and its location data removed.
_Alternative:_ parse and strip EXIF segments from the original bytes. More
code, keeps the original resolution, and is exactly what ADR 0003 says not to
send.

**C6. Which rows can carry a photo.** Every series row on the form, sighters
included, one photo per row. A row with a photo is kept even when it has no
shots, as the phone keeps a series that has only a photo (it can be scored
from the photo on the phone later). Rows the builder already keeps are
unchanged.
_Alternative:_ refuse a photo on a row without shots. I do not recommend it:
the phone allows it, and it is the natural way to hand a target to the phone's
photo scoring.

**C7. No new dependency; no new endpoint.** The upload is the existing
`createPhotoApi().upload` (shared), the decode and encode are browser APIs
(`createImageBitmap`, canvas `toBlob`), the preview a `blob:` URL (the CSP
already allows `img-src blob:`).

## 3. Design

- `shared/src/sync-client/photo-queue.ts`: `scaledPhotoSize(width, height)` →
  `{ width, height }`, the longer edge at most `PHOTO_MAX_EDGE_PX`, aspect kept,
  rounded, never upscaled, at least 1 px.
- `shared/src/sync-client/rows.ts`: `SeriesFields.photoUri?: string | null`
  (absent = `null`, as before).
- `shared/src/sync-client/session-entry.ts`: `SeriesDraft.hasPhoto?: boolean`
  (absent = false); a row with a photo is kept; its series row carries
  `toSyncPhotoUri(seriesId)`; the ok result gains
  `photos: { row: number; photoId: string }[]`, `row` the 1-based form row,
  in form order.
- `web/src/entry/photo-upload.ts` (pure, gated): `photoUploadFailure(error)`
  maps a thrown upload error to a held/dropped failure (C3); `uploadPhotos`
  uploads every photo of a request not yet confirmed, stopping at the first
  failure; `blobsFor(photos, rows, picks)` pairs the builder's photo ids with
  the picked blobs by form row.
- `web/src/entry/save.ts`: an optional `uploadPhotos` dependency, called after
  the user check and before the push, for fresh and held requests alike; its
  failure ends the save with the failure's message and holds or drops the
  request per C3. Without it the save is exactly #669's.
- `web/src/photo-encode.ts` (browser only, verified in the browser):
  `encodeSeriesPhoto(file)` → JPEG `Blob` per C4.
- `web/src/entry/series-photo.tsx`: the per-row **Add Photo** button (file
  input), the thumbnail, **Remove**, and the pick errors. `entry.tsx` keeps the
  picks by row key and wires the dependency.
- `web/src/api.ts`: `uploadPhoto(photoId, blob)` through `createPhotoApi`.

| Outcome (new)                     | Message (`web.entry.*`)                                          | Request |
| --------------------------------- | ---------------------------------------------------------------- | ------- |
| upload: no response, 5xx, 408     | `failedNetwork` (as a push)                                      | held    |
| upload: 401                       | `failedSignedOut` + inline sign-in (as a push)                   | held    |
| upload: 429                       | `failedPhotoRateLimited`: too many photos this hour; Retry later | held    |
| upload: 413 `quota_exceeded`      | `failedPhotoQuota`: photo storage is full                        | dropped |
| upload: 413 `photo_too_large`     | `failedPhotoTooLarge`                                            | dropped |
| upload: anything else             | `failed`                                                         | dropped |
| pick: cannot decode               | `photoUnreadable` (beside the row)                               | —       |
| pick: over 1.5 MB after re-encode | `photoTooLarge` (beside the row)                                 | —       |

## 4. Scenarios

Each maps to a named test (name = id + title). "Falsified by" names the change
to the implementation that the test must catch; Stryker runs the rest.

```gherkin
Feature: photo size (shared/src/sync-client/photo-queue.test.ts)
  Scenario: S1 scaledPhotoSize downscales the longer edge to 2048 and keeps the aspect
    Then 4000×3000 → 2048×1536, 3000×4000 → 1536×2048, 4096×4096 → 2048×2048,
         2049×1 → 2048×1
  Scenario: S2 scaledPhotoSize never upscales and never returns 0
    Then 2048×1000 and 640×480 are unchanged, 10000×1 → 2048×1
    Falsified by: `>` → `>=`; dropping the Math.max(1, …); scaling by the shorter edge

Feature: a photo on a built series (shared/src/sync-client/session-entry-photo.test.ts)
  Scenario: G1 a row with a photo gets the marker of its own series id
    Given rows "10 9" (photo), "8 7" (no photo)
    Then series 1's photo_uri is "shotledger-photo:<series 1 id>", series 2's is null,
         and photos = [{ row: 1, photoId: <series 1 id> }]
  Scenario: G2 a blank free-format row with a photo is kept, without shots, at its position
    Given rows "10", "" (photo), "" (no photo), "9"
    Then 3 series at positions 1..3, the second has the marker and no shots,
         and photos = [{ row: 2, photoId: <series 2 id> }]
  Scenario: G3 a fixed-format skeleton row and a sighter can carry a photo; rows map by form row
  Scenario: G4 no photo anywhere is #669's output exactly (photos = [], every photo_uri null)
  Scenario: G5 a refused entry builds no photos (errors only)
  Scenario: G6 (R7) a row naming an uploaded photo id takes it as its series id; the others draw new ids
  Scenario: G7 (R6) a final row with a photo and no shots is kept; without the photo it is dropped
    Falsified by: keying the marker to the session id; dropping the hasPhoto keep;
                  reporting the kept index instead of the form row

Feature: upload failures (web/src/entry/photo-upload.test.ts)
  Scenario: P1 no response → network, held; 500/503/408 → network, held
  Scenario: P2 401 → unauthenticated, held; 429 → photoRateLimited, held
  Scenario: P3 413 quota_exceeded → photoQuota, dropped; 413 photo_too_large or an
            unreadable body → photoTooLarge, dropped
  Scenario: P4 400/404/411/415 → unknown, dropped
  Scenario: P5 uploadPhotos uploads each unconfirmed photo once, in order, as image/jpeg
            to its id, and records it confirmed
  Scenario: P6 uploadPhotos skips a confirmed photo (Retry after a later failure)
  Scenario: P7 uploadPhotos stops at the first failure: later photos are not sent,
            earlier ones stay confirmed
  Scenario: P8 a photo id with no blob → unknown, dropped, nothing sent
  Scenario: P9 blobsFor pairs each photo with the blob picked on its form row
  Scenario: P10 no shooting data or photo bytes in browser storage: the sources of
            photo-upload.ts, photo-encode.ts and series-photo.tsx name no localStorage,
            sessionStorage or indexedDB

Feature: save with photos (web/src/entry/photo-save.test.ts)
  Scenario: V1 photos upload before the push, and the push is sent only after every upload
  Scenario: V2 an upload failure sends no push; held → Retry uploads the rest and pushes
            the identical request; the confirmed photo is not uploaded again
  Scenario: V3 a dropped upload failure (photoQuota) holds nothing and sends no push
  Scenario: V4 a push lost after the uploads holds the request; Retry uploads nothing
            again and resends the identical push
  Scenario: V5 another account signed in before Retry → accountChanged; no upload, no push
  Scenario: V6 without uploadPhotos, save is #669's (the existing save.test.ts passes unchanged)
  Scenario: V7 an upload step that throws ends the save as failed: unknown, nothing held
  Scenario: V8 (R7) after photo storage is full, the re-save reuses the photo that arrived: no second upload
  Scenario: V9 (R7) a spare id is reused only with the same bytes; a re-picked photo is uploaded again
  Scenario: V10 (R7) a push that may have landed takes its photos out of spare; another account drops them
  Scenario: V11 (R7) afterEdit keeps the spare photos and otherwise returns IDLE
  Scenario: V12 (R7) reusablePhotoIds maps a row to the spare id of the very bytes it picked
    (V4's second test now also expects the refused push's photos to stay spare)

Feature: a photo on a form row (web/src/entry/model.test.ts, kinds.test.ts; R6, R7)
  Scenario: PM1 a layout change keeps a blank row with a photo, in free and fixed format
  Scenario: PM2 adding, replacing or removing a photo is not sendsTheSame, so it drops a held request
  Scenario: PM3 toDraft marks a row with a photo, and only that row
  Scenario: PK1 buildEntry names a row's already uploaded photo by its id, and draws new ids otherwise
    Falsified by: pushing before uploading; resending confirmed photos; holding on 413;
                  uploading before the account check

Feature: on the phone's schema (app/src/db/queries/web-photo-rows.test.ts)
  Scenario: A4 a web entry with a photo applies on the phone; the series reads back with
            the marker, and reconcilePhotoQueue queues one download for the series id and
            no upload
  Scenario: A5 the series row with a photo still has exactly the table's columns

Feature: round trip (backend/test/web-photo.spec.ts, Workers pool, real D1 and R2)
  Scenario: W5 a web entry with a photo: the upload then the push through the real
            transport; device B pulls the marker and downloads the exact uploaded bytes
  Scenario: W6 Retry after a lost push: uploading the same id again and resending the
            push answers duplicate, and the quota counts the photo once
  Scenario: W7 an upload answered 413 quota_exceeded stores no object and no photo row, and
            leaves the usage (R9: "no series" dropped — the test never pushed; V3 owns that)
  Scenario: W8 (R8) near the limit, re-uploading a photo already stored nets its size;
            a new photo is refused
```

Browser checks (`wrangler dev`, synthetic account; screenshots kept locally,
never attached): attach a JPEG that carries EXIF GPS and orientation, save,
confirm the stored object is a JPEG with no `Exif` segment, the longer edge
2048 and the orientation applied; see the photo on the Sessions page; a
non-image file and a too-large one are refused at pick; offline Save still
disabled.

## 5. Must NOT

- **N1** Never push a series row naming a photo before that photo's upload is
  confirmed (V1, V2, V4).
- **N2** Never upload the picked file: only the re-encoded JPEG leaves the
  browser, so no EXIF/GPS and no original (C4, C5; browser check).
- **N3** No photo bytes or shooting data in browser storage (P10; the existing
  N1 test of #669 still covers `web/src/entry/*.ts`).
- **N4** No new endpoint, no protocol or schema change, no new dependency (C7).
- **N5** No automatic retry: uploads happen only on Save or Retry (V2).
- **N6** An entry with no photo is built and saved exactly as before (G4, V6,
  #669's suites unchanged).
- **N7** The phone's behaviour does not change: no phone source changes; the
  shared additions are optional fields and one new function.

## 6. Failure model

| Mode                                                  | Caught by                                            |
| ----------------------------------------------------- | ---------------------------------------------------- |
| a series names a photo the server lacks (dangling)    | N1: V1, V2, V4; W5                                   |
| photo uploaded, push never lands (orphan, quota)      | known limit (C1); W6 shows Retry counts once         |
| the re-save after a dropped failure re-uploads (R7)   | V8–V12, PK1, G6; browser check                       |
| a Retry near the limit refused for its own photo (R8) | W8                                                   |
| a layout change drops a photo's row (R6)              | PM1, G7; browser check                               |
| Retry double-counts quota or re-sends confirmed ones  | P6, V2, V4, W6                                       |
| photo attached to the wrong series                    | G1–G3, P9, A4                                        |
| EXIF / GPS / original leaves the browser              | N2: browser check of the stored bytes                |
| a format the phone cannot store as `.jpg`             | always `image/jpeg` (P5); browser check              |
| over the server cap                                   | pick-time check; server 413 → P3, W7                 |
| a held request sent to another account                | V5 (R14 of #669)                                     |
| a held request that no longer matches the form        | PM2 (R6: a photo edit is a form edit); browser check |
| a huge picture exhausts the tab's memory on decode    | known limit: the browser's decoder decides           |

## 7. Setup plan

- **Isolation:** the existing worktree
  `~/orca/workspaces/shotledger/web-entry-photo`, branch `feat/web-entry-photo`
  from PR #669's head; the PR targets `feat/web-series-entry-impl`.
- **Git:** this spec is committed first; then checkpoint commits per green
  layer. DCO-signed Conventional Commits, explicit paths.
- **Gauntlet:** existing. `web/src/entry/*.ts` and `shared/src/sync-client/*.ts`
  are already in Stryker's `mutate` list, so the new pure modules carry the
  100% coverage gate and mutation with no config change. `web/src/photo-encode.ts`
  and `web/src/entry/series-photo.tsx` are browser code outside the gate,
  verified in the browser (as `entry.tsx` is).
- **New dependencies:** none.

## 8. Revisions

Appended by the same run while building (none loosens a constraint):

- **Rev 1 (P5).** "As image/jpeg" is not the pure module's to decide: the
  type is set by `uploadPhoto` in `web/src/api.ts`, and checked by W5 and the
  browser check (the stored object's `content-type`).
- **Rev 2 (§3, save).** The save dependency is
  `photos: { heldFor, upload }`, not `uploadPhotos`; `HeldPhotos` carries the
  request's photo ids beside the blobs and the confirmed set.
- **Rev 3 (V6 widened).** A request that names photos with no photo step
  fails closed (`unknown`, no push, nothing held).
- **Rev 4 (P8 made strict).** Every pending photo's bytes are checked before
  any upload, so a missing blob sends nothing.
- **Rev 5 (known limit, found in the adversarial pass).** A photo whose
  encoding finishes while a save is in flight is not in that save, and a held
  request does not pick it up; recorded in the evidence report.

Appended after independent verification round 1 (`failed` at `8e80dbb2`), at
the maintainer's request to fix every finding:

- **R6 (F3, F5, and the minor pick race).** A photo pick now lives on its form
  row as a token (`Row.photo`, `withRowPhoto`), so the layout code keeps a
  blank row that carries one (free and fixed format, PM1), and a photo edit
  goes through the page's one `edit` path, where `sendsTheSame` sees it and
  drops a held request (PM2). The bytes stay in the page's picks. A pick that
  finishes after a newer pick on the same row, or after its removal, is
  discarded. A photo also keeps a final row that has no shots (G7), as it
  keeps any row (C6).
- **R7 (F1).** Photos the server confirmed for a save whose push was never
  sent, or was refused outright, are kept as _spare_ (`SaveState.spare`, by id
  with their bytes). An edit keeps them. The next build gives a row whose
  picked bytes are spare that photo's id as its series id
  (`reusablePhotoIds`, `SeriesDraft.photoId`), and the upload step treats it
  as confirmed, so the re-save the quota message asks for uploads only what
  never arrived (V8). A push that may have landed takes its photos out of
  spare, since its series may now name them; a save clears spare; another
  account drops it. The quota message now says arrived photos are not sent
  again.
- **R8 (F2).** C3's "re-uploading the same id is safe" was true of the quota
  accounting, not of the admission check. The upload route now subtracts the
  stored object's size before checking the quota, as `recordUpload` already
  nets it, so a Retry near the limit fits (W8).
- **R9 (F4 and the storage scan).** W7 no longer claims "no series": it never
  pushed. It now checks no object, no photo row and unchanged usage; V3 owns
  "no push after a failed upload". The browser-storage scans also match a
  computed `'…' + 'Storage'`, the Cache Storage API and `document.cookie`, and
  a test feeds them each spelling.
- **R10 (rebase onto main with #716 tags and #718 rounds-only).** The photo
  flags reach the builder through `kinds.ts`' `buildEntry`; a rounds-only
  entry has no series and so no photos (`photos: []`), and `withEntryTags`
  passes the entry's photos through.
