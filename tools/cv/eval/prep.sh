#!/bin/sh
# Photos -> 2048 px greyscale PGMs, for closeup.eval.ts, disc.eval.ts and
# closeup-real.eval.ts. Every tool then reads the same pixels, decoded once by
# ImageMagick. An existing PGM is kept.
#
#   tools/cv/eval/prep.sh <out-dir> <photo>...
#
# Photos and PGMs are personal data: keep both outside the repo.
set -eu
if [ "$#" -lt 2 ]; then
  echo "usage: $0 <out-dir> <photo>..." >&2
  exit 2
fi
out=$1
shift
mkdir -p "$out"
for photo in "$@"; do
  name=$(basename "$photo")
  dst="$out/${name%.*}.pgm"
  [ -e "$dst" ] && continue
  magick "$photo[0]" -auto-orient -resize '2048x2048>' -colorspace Gray -depth 8 "$dst"
done
