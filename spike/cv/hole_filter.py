"""The texture hole/patch filter, and the loosened proposal stage that lost.

Step 3 of the order in #264. Two halves, deliberately separable so each could
be measured on its own — and they came out opposite ways
(docs/specs/cv-corpus-validation-2026-09.md section 5):

  * `features()` / `probability()` -- **shipped.** Six texture descriptors of a
    hole-sized crop and the logistic regression over them, all computed on the
    *grey* rectified canvas so the same arithmetic can run in the app on the
    `RectifiedCanvas` it already holds. Behind the existing proposal stage this
    cuts false positives from 4.65 to 0.32 per photo at 90% precision.
    **This file is the reference**: it runs against OpenCV and
    `fit_hole_filter.py` fitted the constants here.
    `shared/src/target-scoring/hole-features.ts` re-implements it without
    OpenCV for the app, and `gen_hole_feature_fixtures.py` writes the fixture
    that pins the two together. Neither may change without the other.

  * `propose()` -- **not shipped, kept as a measured negative result.** The
    idea was sound: the phase-1 stage is tuned tight because nothing
    downstream could reject a false positive, so with a classifier behind it
    it could propose more. Measured on both corpora it proposes three times as
    much and finds FEWER holes (40% recall against the tight stage's 65%), and
    even with the brakes fully off -- `LOOSE` with `glyph_scale` disabled,
    `k_mad` 6 and a cap of 200, which does reach 82% -- the filter then has to
    run so hard to control 51 false positives per photo that end-to-end recall
    lands below the tight stage's. The cause is visible in the panels: the
    glyph suppression keys on structures longer than 2.6 hole diameters, and a
    printed digit on the 25 m face measures 37-40 px against a hole's 23, so
    the digits survive, saturate the candidate cap ranked by response
    strength, and push real holes out of the list.

Why the loose stage is a rework and not just lower thresholds: lowering the
percentile thresholds of `find_holes` *reduced* its candidate count on the
photos it misses (the low-threshold blobs merge into the printed digits and
fail the size tests), and its response maps are dominated by the printed
ring lines -- a 3.5x-hole kernel next to a white line on black returns a
response of 150-200 grey levels where a hole is a bump of ~16. The loose
stage therefore (1) uses a hole-scale kernel, (2) removes the ring lines and
the printed digits from the response *before* thresholding, and (3)
thresholds relative to the zone's own robust spread, so that a 5-MAD hole
survives regardless of what the printed lines do. It was not enough.
"""
from __future__ import annotations

import math

import cv2
import numpy as np

import target_cv as T
from target_cv import Hole

CROP = 48  # px at 4 px/mm -> 12 mm box, ~2x a .22 hole

# ---------------------------------------------------------------- proposal

LOOSE = dict(
    kernel_scale=1.6,   # structuring element, in hole diameters
    k_mad=12.0,         # response threshold, in MADs of the zone's grey level
    min_delta=8.0,      # ... but never below this many grey levels
    glyph_scale=2.6,    # a low-threshold structure longer than this is print
    area=(0.15, 6.0),   # blob area, in units of a hole's area
    disc=(0.18, 1.10),  # largest inscribed disc, in hole diameters
    max_candidates=40,  # keep the strongest responses per photo
)


def propose(rect, geom: T.Geometry, kind: str, params: dict = LOOSE) -> list[Hole]:
    """Hole-scale top-hat (bright on black, bright on paper) and black-hat
    (dark on paper, dark on black) responses with the printed structure
    masked out, thresholded against the zone's own spread. Every candidate
    carries its normalised response in `notes[0]`."""
    spec = T.TARGETS[kind]
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    d = T.BULLET_MM * geom.px_per_mm
    cx, cy = geom.center
    black_r = spec["black_mm"] / 2 * geom.px_per_mm
    max_r = spec["rings"][-1][1] / 2 * geom.px_per_mm
    card = T._card_mask(rect)
    inzone = np.zeros(g.shape, np.uint8)
    cv2.circle(inzone, (int(cx), int(cy)), int(max_r), 255, -1)
    inzone = cv2.bitwise_and(inzone, card)
    bz = np.zeros(g.shape, np.uint8)
    cv2.circle(bz, (int(cx), int(cy)), int(black_r * 0.985), 255, -1)
    if not spec["black_solid"]:
        bz[:] = 0  # milsnabb: treat the whole face as paper, as find_holes does
    bz = cv2.bitwise_and(bz, card)
    pz = cv2.bitwise_and(inzone, cv2.bitwise_not(bz))
    lines = T._ring_line_mask(g.shape, geom, kind, d)
    lines_d = cv2.dilate(lines, np.ones((int(0.4 * d) | 1,) * 2, np.uint8))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                  (max(3, int(d * params["kernel_scale"])) | 1,) * 2)
    out: list[Hole] = []
    for zone, polarity in ((bz, "bright"), (pz, "dark"), (bz, "dark_black"), (pz, "bright_paper")):
        if not (zone > 0).any():
            continue
        out += _channel(g, zone, polarity, k, lines, lines_d, d, params)
    out = T._dedupe(out, d)
    out.sort(key=lambda h: -h.notes[0])
    return out[:params["max_candidates"]]


def _channel(g, zone, polarity, k, lines, lines_d, d, p):
    bright = polarity in ("bright", "bright_paper")
    resp = cv2.morphologyEx(g, cv2.MORPH_TOPHAT if bright else cv2.MORPH_BLACKHAT, k)
    resp = resp.astype(np.float32)
    z = g[zone > 0].astype(np.float32)
    bg = float(np.median(z))
    mad = float(np.median(np.abs(z - bg))) + 0.5
    # Printed digits: whatever stands out from the zone at a low threshold and
    # is far longer than a hole once the ring lines are removed.
    if polarity in ("bright", "dark_black"):
        lo = ((g.astype(np.int16) > bg + 35) & (zone > 0)).astype(np.uint8) * 255
    else:
        lo = ((g.astype(np.int16) < bg - 35) & (zone > 0)).astype(np.uint8) * 255
    lo = cv2.bitwise_and(lo, cv2.bitwise_not(lines))
    lo = cv2.morphologyEx(lo, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    nlo, lab, st, _ = cv2.connectedComponentsWithStats(lo, 8)
    glyph = np.zeros(g.shape, np.uint8)
    for j in range(1, nlo):
        if max(st[j, cv2.CC_STAT_WIDTH], st[j, cv2.CC_STAT_HEIGHT]) > p["glyph_scale"] * d:
            glyph[lab == j] = 255
    glyph = cv2.dilate(glyph, np.ones((int(0.5 * d) | 1,) * 2, np.uint8))
    resp[zone == 0] = 0
    resp[lines_d > 0] = 0
    resp[glyph > 0] = 0
    thr = max(p["min_delta"], p["k_mad"] * mad)
    bw = (resp >= thr).astype(np.uint8) * 255
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab2, st2, cen = cv2.connectedComponentsWithStats(bw, 8)
    dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
    unit = math.pi * (d / 2) ** 2
    out = []
    for i in range(1, n):
        a = int(st2[i, cv2.CC_STAT_AREA])
        if not (p["area"][0] * unit <= a <= p["area"][1] * unit):
            continue
        sel = lab2 == i
        dt = float(dist[sel].max())
        if not (p["disc"][0] * d <= dt <= p["disc"][1] * d):
            continue
        x, y = float(cen[i][0]), float(cen[i][1])
        if a > 2 * unit:
            # line-merged: recentre on the widest part, not the merged centroid
            ys, xs = np.nonzero(sel & (dist >= dt - 1))
            x, y = float(xs.mean()), float(ys.mean())
        h = Hole(x, y, math.sqrt(a / math.pi), polarity)
        h.notes = [float(resp[sel].max() / mad)]
        out.append(h)
    return out


def propose_tight(rect, geom, kind):
    """The phase-1 stage, unchanged: `target_cv.find_holes(variant="v1")`."""
    return T.find_holes(rect, geom, kind, "v1")


# ---------------------------------------------------------------- features

FEATURE_NAMES = ("orient_entropy", "hf_energy", "laplacian_var", "grad_mean",
                 "centre_deviation", "std")


def crop_at(gray, x, y, size=CROP):
    """The `size`x`size` crop centred on (x, y), or None at the canvas edge."""
    x, y = int(round(x)), int(round(y))
    h, w = gray.shape[:2]
    half = size // 2
    if x - half < 0 or y - half < 0 or x + half > w or y + half > h:
        return None
    return gray[y - half:y + half, x - half:x + half]


def features(gray_crop: np.ndarray) -> dict[str, float]:
    """Texture descriptors of one hole-sized grey crop, all scale-free.

    A patch is flat -- uniform fill, straight manufactured edges -- and a hole
    has a bright torn rim against dark ink, so local variance and gradient
    statistics separate them (AUC 0.94 from `std` alone, measured in
    docs/specs/cv-corpus-validation-2026-09.md).
    """
    g = gray_crop.astype(np.float32) / 255.0
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    ang = np.arctan2(gy, gx)

    # A torn rim has gradients in every direction; a patch edge is a straight
    # line, so its gradients cluster in two.
    hist, _ = np.histogram(ang.ravel(), bins=18, range=(-np.pi, np.pi),
                           weights=mag.ravel())
    p = hist / (hist.sum() + 1e-9)
    orient_entropy = float(-(p * np.log(p + 1e-9)).sum())

    # Torn fibre is high-frequency, flat paper is not.
    blur = cv2.GaussianBlur(g, (5, 5), 0)
    hf = float(np.mean((g - blur) ** 2) * 1e3)

    lap = float(cv2.Laplacian(g, cv2.CV_32F).var() * 1e3)
    n = g.shape[0]
    centre = g[n // 3:2 * n // 3, n // 3:2 * n // 3]
    return dict(
        orient_entropy=orient_entropy,
        hf_energy=hf,
        laplacian_var=lap,
        grad_mean=float(mag.mean()),
        centre_deviation=float(abs(centre.mean() - g.mean())),
        std=float(g.std()),
    )


# Fitted by spike/cv/fit_hole_filter.py over 208 candidates from 31 hand-marked
# photos across both corpora. Kept in lock-step with
# shared/src/target-scoring/hole-features.ts, which the app runs; this file is
# the reference for the arithmetic that produced them.
WEIGHTS = {
    "orient_entropy": 28.0314,
    "hf_energy": -1.1230,
    "laplacian_var": 0.1180,
    "grad_mean": 27.5267,
    "centre_deviation": 31.6067,
    "std": -47.8310,
}
BIAS = -85.0118
THRESHOLD = 0.5


def probability(feat: dict[str, float], weights=None, bias=None) -> float:
    w = WEIGHTS if weights is None else weights
    b = BIAS if bias is None else bias
    z = b + sum(w[k] * feat[k] for k in FEATURE_NAMES)
    return 1.0 / (1.0 + math.exp(-z))
