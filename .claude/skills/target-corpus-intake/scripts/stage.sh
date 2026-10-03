#!/usr/bin/env bash
# Stage contributed target photos for review: unpack, convert to JPEG, number,
# contact-sheet, and list likely duplicates. Never touches the sources.
#
#   stage.sh <staging-dir> <source>...
#
# A source is a folder, an archive (zip, tar[.gz|.bz2|.xz], 7z, rar) or a
# single file, in any image format ImageMagick reads (JPEG, HEIC/HEIF, PNG,
# WebP, TIFF, DNG, AVIF ...). Archives inside archives are unpacked too.
# Writes into <staging-dir>: raw/ (extracted originals), jpg/ (one full-size
# JPEG per image), index.tsv (number, original path, size, capture time),
# sheets/ (5x4 contact sheets of numbered thumbnails), skipped.tsv (anything
# that is not an image) and duplicates.tsv (candidates, to verify by eye).
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,13p' "$0" >&2
  exit 2
fi
out=$1
shift
command -v magick >/dev/null || { echo "needs ImageMagick 7 (magick)" >&2; exit 1; }
mkdir -p "$out/raw" "$out/jpg" "$out/sheets/thumbs"

unpack() { # archive dest
  case "${1,,}" in
    *.zip) unzip -q -o "$1" -d "$2" ;;
    *.tar | *.tar.gz | *.tgz | *.tar.bz2 | *.tar.xz) tar -xf "$1" -C "$2" ;;
    *.7z | *.rar) 7z x -y -o"$2" "$1" >/dev/null ;;
    *) return 1 ;;
  esac
}
is_archive() { case "${1,,}" in *.zip | *.tar | *.tar.gz | *.tgz | *.tar.bz2 | *.tar.xz | *.7z | *.rar) return 0 ;; esac; return 1; }

# 1. Copy or unpack every source into raw/<n>-<name>/.
n=0
for src in "$@"; do
  n=$((n + 1))
  dest="$out/raw/$(printf '%02d' "$n")-$(basename "$src")"
  mkdir -p "$dest"
  if [ -d "$src" ]; then
    cp -a "$src/." "$dest/"
  elif is_archive "$src"; then
    unpack "$src" "$dest"
  else
    cp -a "$src" "$dest/"
  fi
done
# Archives that were inside archives (an iCloud export of a zip, say).
while IFS= read -r -d '' a; do
  d="${a%.*}.unpacked"
  mkdir -p "$d" && unpack "$a" "$d" && rm -f "$a"
done < <(find "$out/raw" -type f \( -iname '*.zip' -o -iname '*.tar*' -o -iname '*.tgz' -o -iname '*.7z' -o -iname '*.rar' \) -print0)
# Platform debris: macOS resource forks, Finder and Explorer metadata.
find "$out/raw" -depth -type d -name '__MACOSX' -exec rm -rf {} +
find "$out/raw" -type f \( -name '.DS_Store' -o -name '._*' -o -iname 'Thumbs.db' -o -iname 'desktop.ini' \) -delete

# 2. Convert every image to JPEG; list everything else.
printf 'id\toriginal\tsize\tcaptured\n' >"$out/index.tsv"
printf 'original\treason\n' >"$out/skipped.tsv"
i=0
while IFS= read -r -d '' f; do
  if ! dims=$(magick identify -format '%wx%h' "${f}[0]" 2>/dev/null); then
    printf '%s\tnot an image ImageMagick can read\n' "${f#"$out"/}" >>"$out/skipped.tsv"
    continue
  fi
  i=$((i + 1))
  id=$(printf 'P%03d' "$i")
  when=$(magick identify -format '%[EXIF:DateTimeOriginal]' "${f}[0]" 2>/dev/null || true)
  dst="$out/jpg/$id.jpg"
  case "${f,,}" in
    # Already JPEG: keep the bytes, so nothing is recompressed.
    *.jpg | *.jpeg) cp -p "$f" "$dst" ;;
    *) magick "${f}[0]" -auto-orient -quality 92 "$dst" ;;
  esac
  magick "$dst" -auto-orient -thumbnail 480x480 "$out/sheets/thumbs/$id.jpg"
  printf '%s\t%s\t%s\t%s\n' "$id" "${f#"$out"/}" "$dims" "$when" >>"$out/index.tsv"
done < <(find "$out/raw" -type f -print0 | sort -z)

# 3. Contact sheets, 20 per sheet, labelled with the id.
(
  cd "$out/sheets/thumbs"
  find . -maxdepth 1 -name "*.jpg" | sort | split -l 20 - ../batch_
)
for b in "$out"/sheets/batch_*; do
  [ -e "$b" ] || continue
  # shellcheck disable=SC2046
  montage -label '%t' $(sed "s|^\./|$out/sheets/thumbs/|" "$b") -tile 5x4 -geometry 360x360+3+3 \
    -pointsize 24 "$out/sheets/sheet_${b##*batch_}.jpg"
  rm "$b"
done

# 4. Duplicate candidates: same capture time, or the same file name stem in
# two formats (a JPEG sent separately next to its HEIC original).
awk -F'\t' 'NR > 1 && $4 != "" { print $4 "\t" $1 }' "$out/index.tsv" | sort |
  awk -F'\t' '{ if ($1 == prev) print "same capture time\t" pid "\t" $2; prev = $1; pid = $2 }' >"$out/duplicates.tsv"
awk -F'\t' 'NR > 1 { n = $2; sub(/.*\//, "", n); sub(/\.[^.]*$/, "", n); print tolower(n) "\t" $1 }' "$out/index.tsv" | sort |
  awk -F'\t' '{ if ($1 == prev) print "same name stem\t" pid "\t" $2; prev = $1; pid = $2 }' >>"$out/duplicates.tsv"

echo "$i images staged in $out/jpg; $(($(wc -l <"$out/skipped.tsv") - 1)) skipped; $(wc -l <"$out/duplicates.tsv") duplicate candidates"
find "$out/sheets" -maxdepth 1 -name "sheet_*.jpg" | sort | sed "s/^/sheet: /"
