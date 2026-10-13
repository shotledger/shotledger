# Evidence report — a target photo on a series entered on the web (Tier 3)

Spec: [`web-entry-photo-spec.md`](web-entry-photo-spec.md), including its §8
Revisions.

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; the key choices C1–C7 are listed in the PR for the
  maintainer. The maintainer asked for every round-1 finding to be fixed
  (R6–R10); that is not an approval. Confidence is downgraded accordingly:
  the spec is the artifact to review after the fact.
- **Source state:** code at `cb91d49a` on `feat/web-entry-photo`, rebased onto
  `origin/main` at `41b1b7fe` (#716 tags, #718 rounds-only and #752 merged;
  R10). The commits after it change only the spec and this report. Every
  number below is from a fresh run on that state, except Stryker, which ran
  one commit earlier on files that commit did not change (see the gauntlet).
  (Round 1's report described an earlier base: jest 62/708 against the 63/712
  the verifier saw at `8e80dbb2`, F6.)
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest, Stryker,
  fast-check, TypeScript; the backend's Workers vitest pool), unchanged by
  this branch.
- **Entry point:** `pnpm check`; `cd backend && npx vitest run
test/web-photo.spec.ts --testTimeout=60000`; the Stryker subset below.
- **Independent verification: round 1 `failed` at `8e80dbb2`** (report on
  the PR). Its findings F1–F6 and the minor ones are fixed below (R6–R10).
  No verifier has seen the fixes: **the final state is unverified**, and a
  round 2 in a fresh context is still owed.

## Spec → test mapping

| Scenario                                                                          | Test                                                                                                                                      | Status |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1 downscale to 2048, aspect kept                                                 | `shared/src/sync-client/photo-queue.test.ts` › S1                                                                                         | pass   |
| S2 never upscale, never 0 (+ property)                                            | `photo-queue.test.ts` › S2 (two tests, one fast-check)                                                                                    | pass   |
| G1 marker of its own series id                                                    | `shared/src/sync-client/session-entry-photo.test.ts` › G1                                                                                 | pass   |
| G2 blank row with a photo kept, no shots                                          | `session-entry-photo.test.ts` › G2                                                                                                        | pass   |
| G3 skeleton row, sighter, row past the skeleton                                   | `session-entry-photo.test.ts` › G3 (two tests)                                                                                            | pass   |
| G4 no photo = #669's output                                                       | `session-entry-photo.test.ts` › G4; #669's `session-entry.test.ts` unchanged                                                              | pass   |
| G5 refused entry builds no photos                                                 | `session-entry-photo.test.ts` › G5 (passed before the code: armour)                                                                       | pass   |
| G6 a reused photo id becomes the series id (R7)                                   | `session-entry-photo.test.ts` › G6                                                                                                        | pass   |
| G7 a photo keeps a final row (R6)                                                 | `session-entry-photo.test.ts` › G7                                                                                                        | pass   |
| PM1 a layout change keeps a photo's row (R6, F3)                                  | `web/src/entry/model.test.ts` › PM1                                                                                                       | pass   |
| PM2 a photo edit is not sendsTheSame (R6, F5)                                     | `model.test.ts` › PM2                                                                                                                     | pass   |
| PM3 toDraft marks the photo row                                                   | `model.test.ts` › PM3                                                                                                                     | pass   |
| PK1 buildEntry reuses an uploaded photo id (R7)                                   | `web/src/entry/kinds.test.ts` › PK1                                                                                                       | pass   |
| V8–V12 spare photos reused after a dropped failure (R7, F1)                       | `photo-save.test.ts` › V8–V12                                                                                                             | pass   |
| W8 a re-upload near the limit nets its size (R8, F2)                              | `web-photo.spec.ts` › W8                                                                                                                  | pass   |
| P1–P4 upload failure → held / dropped                                             | `web/src/entry/photo-upload.test.ts` › P1–P4                                                                                              | pass   |
| P5–P8 upload order, skip confirmed, stop at first, missing blob                   | `photo-upload.test.ts` › P5–P8                                                                                                            | pass   |
| P9 photos paired by form row                                                      | `photo-upload.test.ts` › P9 (two tests)                                                                                                   | pass   |
| P10 no browser storage in the encoder                                             | `photo-upload.test.ts` › P10; the wider pattern of R9 is fed each spelling (`save.test.ts`)                                               | pass   |
| V1 uploads before the push                                                        | `web/src/entry/photo-save.test.ts` › V1                                                                                                   | pass   |
| V2 upload failure: no push; Retry sends only the rest                             | `photo-save.test.ts` › V2 (two tests)                                                                                                     | pass   |
| V3 dropped failure holds nothing                                                  | `photo-save.test.ts` › V3                                                                                                                 | pass   |
| V4 lost push after uploads; Retry pushes only; a refused push's photos stay spare | `photo-save.test.ts` › V4 (two tests)                                                                                                     | pass   |
| V5 another account → no upload, no push                                           | `photo-save.test.ts` › V5                                                                                                                 | pass   |
| V6 without photos = #669; photos without a step fail closed                       | `photo-save.test.ts` › V6 (two tests); #669's `save.test.ts`                                                                              | pass   |
| V7 a throwing photo step → unknown, nothing held                                  | `photo-save.test.ts` › V7                                                                                                                 | pass   |
| A4 the phone queues a download per photo, no upload                               | `app/src/db/queries/web-photo-rows.test.ts` › A4 (two tests)                                                                              | pass   |
| A5 column parity with a photo                                                     | `web-photo-rows.test.ts` › A5                                                                                                             | pass   |
| W5 upload, push, device B downloads the same bytes                                | `backend/test/web-photo.spec.ts` › W5                                                                                                     | pass   |
| W6 Retry: duplicate acks, quota counted once                                      | `web-photo.spec.ts` › W6                                                                                                                  | pass   |
| W7 413 quota_exceeded: no object, no photo row, usage unchanged                   | `web-photo.spec.ts` › W7 (R9: the vacuous "no series" half removed, F4)                                                                   | pass   |
| N1 no marker before its upload                                                    | V1, V2, V4; browser check 1 (Worker log order)                                                                                            | pass   |
| N2 only the re-encoded JPEG leaves                                                | browser check 2 (stored bytes)                                                                                                            | pass   |
| N3 no photo bytes in browser storage                                              | P10; #669's N1 scan of `web/src/entry/` (covers `series-photo.tsx`, `photo-upload.ts`)                                                    | pass   |
| N4 no endpoint, protocol, schema or dependency change                             | diff: no `app/src/db/schema.ts`, `package.json` or lockfile change; `backend/src` changes only the quota admission line (R8), no endpoint | pass   |
| N5 no automatic retry                                                             | V2 (Retry is a second `save` call); no timer in the code                                                                                  | pass   |
| N6 no photo = as before                                                           | G4, V6, #669's suites unchanged and green                                                                                                 | pass   |
| N7 the phone's behaviour does not change                                          | under `app/src` only a new test and two web-only i18n strings; `pnpm check` (jest 726) green                                              | pass   |

## Gauntlet (final fresh run, at `cb91d49a`)

| Layer                | Command                                                                                                                                                             | Result                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Tests + types + lint | `pnpm check`                                                                                                                                                        | exit 0; vitest 205 files, 3321 tests passed; jest 66 suites, 726 tests passed; tsc, i18n (1289 keys each), licenses, eslint, prettier |
| Coverage gate        | `vitest run --coverage` inside `pnpm check`                                                                                                                         | 100% statements 4146/4146, branches 2669/2669, functions 991/991, lines 3507/3507 on the `mutate` modules                             |
| Mutation             | `npx stryker run --concurrency 2 --mutate` over `shared/src/sync-client/{session-entry,photo-queue,rows}.ts` and `web/src/entry/{photo-upload,save,model,kinds}.ts` | 1004 mutants: 992 killed, 1 timeout, 11 survived, 0 no-coverage (below)                                                               |
| Property-based       | `photo-queue.test.ts` › S2 property                                                                                                                                 | fast-check, 100 runs                                                                                                                  |
| Backend suite        | `cd backend && npx vitest run --testTimeout=60000`                                                                                                                  | 23 files, 208 tests passed (W5–W8 among them)                                                                                         |
| Real execution       | `wrangler dev` + the built web app in headless Chromium, synthetic account                                                                                          | see Browser checks                                                                                                                    |
| Docs gates           | `node scripts/docs-translation-check.mjs`, `node scripts/docs-anchor-check.mjs`, `mkdocs build --strict`                                                            | 26 pages current; no dangling anchors; built                                                                                          |
| Supply chain         | diff of `package.json` / `pnpm-lock.yaml`                                                                                                                           | unchanged; no new dependency                                                                                                          |
| Suite health         | `npx vitest run --sequence.shuffle --sequence.seed=714` over `web/src/entry`, `shared/src/sync-client` and `web-photo-rows.test.ts`                                 | 27 files, 334 tests passed                                                                                                            |

Per module (killed / mutants, Stryker's table): `session-entry.ts` 279/280,
`rows.ts` 53/53, `photo-queue.ts` 82/84, `photo-upload.ts` 79/80, `save.ts`
163/165, `model.ts` 265/270 (plus 1 timeout), `kinds.ts` 71/72. `model.ts`
and `kinds.ts` are from a rerun after the last code commit (`aa2e6c07`,
which changed `kinds.ts` and a test); the other five files are unchanged
since the first run.

Survivors on lines this branch wrote, each equivalent:

- `photo-queue.ts` `longer <= PHOTO_MAX_EDGE_PX` → `<` and `width >= height` →
  `>`: at exactly 2048, or for a square, both branches give the same size.
- `photo-upload.ts` `key === undefined ? undefined : picks.get(key)` →
  `picks.get(key)`: a `Map<number, Blob>` has no `undefined` key.
- `session-entry.ts` `hasPhoto ? row?.photoId : undefined` → `row.photoId`:
  `hasPhoto` is only true when `row` exists.
- `save.ts` `photos?.ids ?? []` and `spare ?? []` → an array holding a string:
  deleting an id no photo has, or mapping a string that never equals a `Blob`,
  changes nothing.

Survivors on lines this branch did not write (#669 and #718), equivalent as
argued in those reports: `model.ts` `lastKey += 1`, `programId === null`, the
two date-regex anchors; `kinds.ts` `programId === null` in `finalOffered`.

Two survivors of the first run were redundant code and were removed instead:
`withUploadedPhotos`' `photoId === undefined ? row : …` (now always names the
id, `undefined` included), and `withRowPhoto`'s key presence is now pinned by
PM2's `toStrictEqual`.

Negative control for P10: appending `// localStorage` to
`web/src/photo-encode.ts` turned P10 red (1 failed); removed again.
Non-vacuity of A4/A5 (they passed on first run, after the builder existed): a
throwaway mutant keying the marker to the session id turned A4 red; restored
(`git checkout`).

## Browser checks after R6–R10 (`wrangler dev --port 8818`, headless Chromium)

A synthetic account (`@example.test`), the web app built from this tree, the
upload and push requests watched (and, where named, failed) by the browser
driver. No console errors. Screenshots in `/home/jimisola/tmp/qa/fix-shots/691/`,
not in the repo; the server was stopped afterwards.

- **F3 / PM1.** Rows `10 9 8 7 6`, blank with a photo, blank. Match Format to
  Full Match and back to Free Format: the rows read `1:-`, `2:photo` (the
  trailing blank row dropped, the photo row kept).
- **F5 / PM2.** Save with the push failed by the driver: **Retry** and "Could
  not reach the server". A photo then added on row 1: the button reads
  **Save** again (the held request dropped).
- **F1 / V8.** Save with the second upload answered `413
{"error":"quota_exceeded"}`: two uploads, no push, "Your photo storage is
  full". Row 2's photo removed, Save again: **no upload**, "Saved.", and the
  pushed series is the first upload's id with the marker
  `shotledger-photo:<that id>`.
- F2 (R8) is the server's admission and is checked by W8, not in the browser.
  The pick race (R6) has no browser check: two encodes cannot be ordered from
  the driver.

## Browser checks before R6 (round 1 build, `wrangler dev --port 8793`, synthetic account)

Input: a synthetic 4000×3000 JPEG with EXIF orientation 6, a camera make and
GPS coordinates; a 5-byte text file named `.jpg`; a 2400×1800 random-noise
JPEG. Screenshots are kept locally, not attached.

1. Three rows (`10 9 X 10 9`, `8 7 6 5 4`, blank), the photo on rows 1 and 3.
   The previews showed the target turned upright. Save: the Worker log reads
   `POST /photos/upload/<series 1> 201`, `POST /photos/upload/<series 3> 201`,
   then one `POST /sync/push 200`, then the refresh pull. The pulled series
   rows carry `shotledger-photo:<own id>` on rows 1 and 3 and `null` on row 2.
2. The stored object (`GET /photos/<id>`): `content-type: image/jpeg`,
   1536×2048 (the 4000×3000 picture rotated by its orientation, then the
   longer edge brought to 2048), 202,904 bytes. Its segments are APP0 (JFIF),
   APP2 (the colour profile), quantisation and Huffman tables — **no APP1, no
   `Exif` marker, no camera make, no GPS** (the source file has all of them).
3. The Sessions page shows both photos under their series; the photo-only
   row reads total 0.
4. The text file was refused beside its row ("this file cannot be read as a
   photo"); the noise JPEG ("the photo is too large, even resized").
5. With the server stopped, Save said it could not reach the server, as in
   #669 (the account check runs before the build, so nothing was held).
6. With the account's hourly upload window set to 60, Save answered
   `upload … 429` and showed **Retry** with the rate-limit message; no push
   was sent. After clearing the window, Retry uploaded the same photo id
   (`201`) and pushed. Photo usage then counted three photos once each
   (608,712 bytes).
7. No console errors (CSP included).

## Failure model check

| Mode                                      | Evidence                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- |
| dangling marker                           | V1, V2, V4, W5; browser check 1 order                                 |
| orphaned photo after a failed save        | known limit (C1); W6 shows a Retry does not double the quota          |
| Retry re-sends confirmed photos           | P6, V2, V4; browser check 6                                           |
| photo on the wrong series                 | G1–G3, P9, A4, W5 (each marker is its own row id)                     |
| EXIF / GPS / original leaves              | browser check 2                                                       |
| a type the phone stores wrongly as `.jpg` | `uploadPhoto` sends `image/jpeg`; W5 and browser check 2 read it back |
| over the cap                              | pick-time refusal (browser check 4); 413 → P3, W7                     |
| held request sent to another account      | V5                                                                    |
| huge input exhausts the tab               | known limit, not exercised                                            |

## Layers not run as specified

- **N-A:** none.
- **UNAVAILABLE:** none.
- **SUBSTITUTED:** the browser encoder (`web/src/photo-encode.ts`) and the
  row control (`web/src/entry/series-photo.tsx`, including R6's discard of a
  stale pick, and `entry.tsx` passing photo edits through `edit`) have no
  automated tests: the
  web package has no DOM test setup, and canvas decoding cannot run under
  vitest's Node environment. They were exercised in Chrome (checks 1–7). That
  cannot detect a browser whose `createImageBitmap` ignores
  `imageOrientation`, or one whose canvas writes metadata; only Chrome was
  checked.

## Dismissed review findings

- none — there was no review.

## Structural blind spot

- The phone side is evidenced on its schema and queue in vitest (A4), not on
  a device: no emulator run downloaded a web-uploaded photo. The download
  path itself is the phone's existing, unchanged code.

## Known limits

- A photo that reached the server before a save failed, and is then
  abandoned (removed from its row, another account, a closed tab, or after a
  push that may have landed), stays in the account's photo storage until the
  account is deleted (C1). R7 removes the common case: the re-save after a
  dropped failure reuses it.
- A photo whose re-encoding finishes while a save is already in flight is not
  part of that save; if that save then holds its request, Retry sends the
  held request without it, although the row shows the photo. Editing the
  form drops the held request and a fresh Save includes it.
- Decoding is the browser's: a very large picture may fail or exhaust the tab.

## Independent verification

- Round 1: a fresh-context verifier (Claude Code / Claude, Opus family) at
  `8e80dbb2`, given the issue, the spec and the commit, not the build
  conversation. Verdict `failed`. Findings and their fixes:
  - F1 (spec gap): the re-save after "photo storage is full" re-uploaded
    arrived photos under new ids → R7, V8–V12, PK1, G6.
  - F2 (description): a re-upload near the limit was refused → R8, W8 (the
    server now nets the stored size).
  - F3 (behavioural): a layout change dropped a photo's blank row → R6, PM1.
  - F4 (mapping): W7's "no series" could not fail → R9.
  - F5 (mapping): photo edits dropping a held request had no gate → R6, PM2,
    browser check.
  - F6 (description): this report's jest numbers were from an older base →
    fresh run above.
  - Minor: the pick race → R6; the storage scan's one spelling → R9.
- The fixes have not been seen by a verifier.

## Honest notes

- R7 and R8 changed V4's second test (a refused push now leaves its photos
  spare) and W7 (its vacuous half removed): behaviour and mapping changes the
  findings asked for, not loosened assertions. W8 was seen failing against the
  unfixed route before R8 went in.

- G5, V4's "cannot have landed" case and V6's no-photo case passed before the
  code existed; they are kept as regression armour (pre-existing behaviour).
- P8 first failed against an implementation that uploaded the photos before
  the missing one; the implementation now checks every blob before sending
  any (spec revision 4).
- The spec's §3 named the save dependency `uploadPhotos`; it is
  `photos: { heldFor, upload }` (revision 2).
