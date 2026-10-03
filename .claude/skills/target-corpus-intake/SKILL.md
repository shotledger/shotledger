---
name: target-corpus-intake
description: Take target photos someone has sent in (a club mate's upload, an iCloud or Google Photos export, a zip, a folder, loose files, any image format including HEIC) and add them to the target-photo corpus that the photo-scoring CV is measured on — unpack, convert to JPEG, drop non-targets and duplicates, record provenance and consent. Use whenever the maintainer says photos have arrived, been uploaded or shared for the corpus, asks whether new photos are any use, or asks to add photos to the corpus.
---

# Add contributed photos to the target corpus

The corpus is real photos of real people's targets. It lives **outside the
repo**, at `~/no_cloud/shotledger/target-corpus/`, which is local and not synced.
Read `CORPUS.md` there first: it records what each folder holds, whose it is,
and what consent covers it.

Nothing from this process goes into the repo, ever: not a photo, not a crop,
not a contributor's name, not a file name that carries one (hard rule 7). The
repo gets counts and conclusions only.

## 1. Find out what arrived

Ask, or look, for:

- **where** it is (a pCloud folder, `~/Downloads`, a path the maintainer gives);
- **who** sent it, used only for the folder name and `CORPUS.md`;
- **whether consent is recorded**, and for what (look, label, train). If the
  maintainer has not said, ask before step 5. Looking at photos to judge whether
  they are useful does not need it; moving them into the corpus does.

Sources come in any shape: a folder, an archive (zip, tar, 7z, rar), loose files
in any image format, or a mix. Do not assume a zip or HEIC.

## 2. Stage them

Stage outside the corpus, so nothing half-reviewed sits next to accepted photos:

```bash
.claude/skills/target-corpus-intake/scripts/stage.sh \
    ~/no_cloud/shotledger/incoming/<who>-<yyyy-mm-dd> <source>...
```

It never modifies the sources. It unpacks archives (including archives inside
archives), strips platform debris (`__MACOSX`, `.DS_Store`, `._*`,
`Thumbs.db`), and converts every image to a full-size JPEG in `jpg/`. Files
already in JPEG are copied byte for byte; HEIC, PNG, WebP, DNG and the rest are
converted, because OpenCV in the CV spike cannot read HEIC. It also writes
`index.tsv` (id, original path, size, capture time), `skipped.tsv`
(non-images), `duplicates.tsv` (candidates) and 5×4 contact sheets in
`sheets/`.

It needs ImageMagick 7 (`magick`; check HEIC with `magick -list format | grep
-i heic`) and `7z` for 7z or rar archives.

## 3. Review every photo by eye

Read every contact sheet. For each photo decide:

| Question               | What to look for                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is it a target at all? | Drop selfies, people, documents, screens and screenshots, labels (a router's Wi-Fi label has turned up), weapons, range views. **Delete these from staging**: they are personal data with no use here.                                           |
| Which face?            | 25 m precision (F.7.1: black covers rings 7–10, white 6 ring); milsnabb (J.7.1: black across rings 5–10, no white ring); fältskytte figures (C30 and others, no rings); ISSF faces; other. `docs/reference/spsf-shb-2026.md` has the dimensions. |
| How is it framed?      | Tight close-up (part of the black, no black edge); the whole black; a centre card ("spegel") pasted over a full target; the whole target at a distance; held in the hand.                                                                        |
| Anything unusual?      | Heavy pasting, hand-drawn marks on the holes, writing on the photo, spotting-camera or screen captures, motion blur, a blank image that did not decode.                                                                                          |

Zoom on anything ambiguous with `magick <file> -crop ... -resize ...` rather
than guessing from a thumbnail. Checking a thumbnail has gone wrong before.

**Duplicates.** `duplicates.tsv` lists photos with the same capture time or
the same name in two formats. Confirm each pair on pixels before dropping one:

```bash
magick a.jpg -resize WxH! /tmp/a.png; magick b.jpg -resize WxH! /tmp/b.png
magick compare -metric RMSE /tmp/a.png /tmp/b.png null:   # (0.003) = same photo re-encoded
```

Keep the larger or original-format copy. A smaller copy can come without a
capture time, so also compare photos that look the same on the sheet.

Record `face`, `framing` and `flags` for every photo as you go, in the
manifest's terms (step 5), so the manifest lines fall out of the review.

Tell the maintainer what arrived before going further: counts per face and
framing, what is new compared with `CORPUS.md` and `manifest.jsonl` (real
close-ups? milsnabb?), and what you propose to drop.

## 4. Drop what is not wanted

Delete non-targets and confirmed duplicates from staging, and record each in the
contributor README (step 5).

Deleting from the **source** (pCloud, Downloads) is the maintainer's call. Ask,
and look at the file once more before deleting it. Leave the original archive
in place: it is the copy to recover from.

## 5. Move into the corpus

Only with consent recorded:

1. Move the staging folder to `target-corpus/<contributor-slug>/`, one folder
   per contributor so provenance never mixes. Use the slug style already in
   `CORPUS.md`. If the contributor already has a folder, add a dated subfolder
   rather than merging.
2. Add one line per photo to `target-corpus/manifest.jsonl` (schema below),
   keeping the file sorted by `path`. Every photo in the corpus is listed
   there exactly once.
3. Write `<contributor-slug>/README.md`: the source path, what was received,
   what was deleted and why, and anything notable the manifest's fields do
   not capture.
4. Add or extend the contributor's section in `CORPUS.md`: counts, faces, what
   it adds, whether there is any milsnabb, and the **consent line**: date,
   "reported by the maintainer", and its scope. If the scope was not stated,
   record the scope assumed and say that it was assumed.
5. If anything was extracted or converted from a source the maintainer keeps,
   put a short note beside that source saying where the photos went, what was
   dropped, and how to undo it (delete the corpus folder, its manifest lines
   and its `CORPUS.md` section, plus any label files made from it) or redo it
   (the `stage.sh` command line).

### The manifest

`manifest.jsonl` is what the evaluation tools select photos by, so a
precision measurement never silently includes a milsnabb photo. Folders stay
per contributor for provenance; the face lives here. One JSON object per line:

```json
{
  "path": "<contributor-slug>/jpg/IMG_0001.jpg",
  "face": "precision",
  "framing": "close-up",
  "flags": ["heavy-pasting"]
}
```

| Field     | Values                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | relative to the corpus root                                                                                                                                                                                                                                                                  |
| `face`    | `precision` (F.7.1, spegel included), `milsnabb` (J.7.1), `falt` (a fältskytte figure; code in `notes`), `other` (say what in `notes`), `none` (not a target: only for a photo kept on purpose, e.g. as a negative; non-targets are otherwise deleted at step 4)                             |
| `framing` | `close-up` (most of the black's edge out of frame), `black` (whole black in frame, nothing much beyond the card), `spegel-over-full` (a centre card over a full target, both visible), `whole-target` (the whole face, no separate card), `camera-frame` (spotting camera or screen capture) |
| `flags`   | optional: `heavy-pasting`, `hand-marked`, `in-hand`, `blurred`, `duplicate-suspect`                                                                                                                                                                                                          |
| `notes`   | optional, short, factual, never a person's name                                                                                                                                                                                                                                              |

Validate after every edit: each line parses, each path exists, and each photo
in the corpus appears exactly once.

## 6. What next

The photos are only measured once something runs on them:

- `spike/cv/eval_closeup_real.py`: runs both target locks on every photo and
  draws overlays to check by eye.
- `spike/cv/mark_holes.py`, then `eval_hole_proposals.py`: hand-label hole
  centres and measure the hole suggestions. Labels go in
  `target-corpus/labels/`, never in the repo.

A milsnabb photo is the scarcest thing the corpus lacks; say so when one
arrives.
