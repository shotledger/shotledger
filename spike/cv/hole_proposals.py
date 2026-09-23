"""Hole proposals: find candidate bullet holes on the rectified canvas and score
each one — the assisted "suggest holes" stage.

**This file is the reference for the arithmetic.** The app runs
`app/src/features/photo-scoring/hole-proposals.ts`, a line-for-line port
without OpenCV, and `hole-proposals.fixtures.json` (written by
`gen_hole_proposal_fixtures.py` from synthetic canvases only) pins the two
together. Change one and you change both. `fit_hole_proposals.py` fitted the
constants; `eval_hole_proposals.py` measures the stage against hand marks.
Numbers: docs/specs/cv-hole-proposals-2026-09.md.

Every operation is written so it can be reproduced exactly outside OpenCV:
masks are distance tests rather than rasterised circles, kernels are built
from the formula rather than looked up, the Laplacian is the 4-neighbour one,
and OpenCV is only used where its result is a plain, well-defined convolution
(`sepFilter2D` with `BORDER_REFLECT_101`).

The stage, on a gray canvas at `px_per_mm` (the app's is 4):

  1. average 2x2 blocks -> a half-resolution canvas for the global maps
  2. valid mask: the warp's white padding, grown so its edge cannot pose as a
     hole edge
  3. Laplacian of Gaussian at three scales around the hole diameter, each
     normalised by the scoring area's own median absolute deviation
  4. candidates = local maxima of |LoG| at the hole scale above a threshold
  5. printed-glyph map: the extent of the low-threshold structure a pixel
     belongs to, ring lines removed (a digit is long, a hole is not)
  6. per candidate, at full resolution: the six texture features of
     `hole_filter.features`, a radial profile, the shape of the blob under it,
     how straight its edges are, where it sits on the face, and the LoG values
  7. a logistic regression over those 30 features -> probability
  8. accept above the threshold, merge peaks closer than one hole diameter,
     and refine each centre to the centroid of its deviation from the paper
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

import hole_filter as HF

# ---------------------------------------------------------------- constants

# Down-sampling factor for the global maps. The maps only have to find and
# size hole-scale blobs, which a 2 px/mm canvas does; it also makes the port
# affordable in JavaScript.
HALF = 2
# |LoG| at the hole scale, in MADs of the scoring area, below which a pixel
# cannot start a candidate. 8 lost 7 of 152 hand-marked holes at the stage.
LOG_THRESHOLD_MAD = 8.0
# Non-maximum suppression: a candidate must be the maximum of the square
# window of this half-size, in hole diameters.
NMS_RADIUS_D = 0.8
# The valid mask: canvas pixels this bright, in a component touching the
# border, are the warp's padding; the mask is grown by this many half-res px.
PAD_WHITE = 254.0
PAD_MIN_AREA = 50
PAD_GROW = 8
# A pixel this far from the zone's median gray is printed or torn structure.
GLYPH_DELTA = 35.0
# Ring lines are excluded from the structure map within this half-width, mm.
LINE_HALF_WIDTH_MM = 0.98
# The black zone, as a fraction of its printed radius (its edge is a line).
BLACK_ZONE_FRACTION = 0.985
# Accepted candidates closer than this, in hole diameters, are one hole.
MERGE_RADIUS_D = 1.0
# Centre refinement: centroid of the deviation within this radius, twice.
REFINE_RADIUS_D = 0.6
REFINE_ITERS = 2
# Clip values so one outlier cannot dominate the logistic.
RING_DIST_CLIP_MM = 6.0
GLYPH_CLIP = 8.0
BLOB_AREA_CLIP = 6.0
BLOB_ELONG_CLIP = 6.0
STRAIGHT_BINS = 18
GRADIENT_EPSILON = 1e-9
# The LoG maps are normalised by the MAD of every MAD_STRIDE-th pixel.
MAD_STRIDE = 4
# Floors on those MADs, just under the smallest of the 31 corpus photos. A
# grain-free image (a scan, rendered art) otherwise has a fine-scale MAD
# ~150x lower, and every printed line then scores as a certain hole.
MAD_FLOOR = {"s1": 0.05, "s2": 0.02, "s05": 0.08}

FEATURE_NAMES = (
    *HF.FEATURE_NAMES,
    "in_black", "ring_dist", "r_mm", "log1", "log2", "log05", "abslog1", "scale_ratio",
    "rb0", "rb1", "rb2", "rb3", "rb4", "nrb0", "nrb1", "nrb2", "nrb3", "nrb4",
    "b_area", "b_fill", "b_elong", "b_touch", "straight", "glyph",
)

# Fitted by fit_hole_proposals.py on 5169 candidates from the 31 hand-marked
# photos (152 holes) — see docs/specs/cv-hole-proposals-2026-09.md. Kept in
# lock-step with HOLE_PROPOSAL_WEIGHTS in the TypeScript port.
WEIGHTS: dict[str, float] = {
    "orient_entropy": 4.271673,
    "hf_energy": 0.182486,
    "laplacian_var": 0.006418,
    "grad_mean": 31.640295,
    "center_deviation": 49.970597,
    "std": -100.117709,
    "in_black": 3.142235,
    "ring_dist": -0.173672,
    "r_mm": -0.033935,
    "log1": -0.252405,
    "log2": -0.482507,
    "log05": 0.036120,
    "abslog1": 0.368739,
    "scale_ratio": -0.378987,
    "rb0": -0.046484,
    "rb1": 0.105095,
    "rb2": 0.128372,
    "rb3": -0.133883,
    "rb4": 0.163354,
    "nrb0": 6.324037,
    "nrb1": 1.064415,
    "nrb2": 1.034327,
    "nrb3": 8.184115,
    "nrb4": -15.963946,
    "b_area": -0.267907,
    "b_fill": 2.844210,
    "b_elong": -0.582949,
    "b_touch": 1.178402,
    "straight": -3.972320,
    "glyph": -0.089777,
}
BIAS = -26.046342
THRESHOLD = 0.7


@dataclass
class Proposal:
    x: float            # canvas px, refined
    y: float
    probability: float
    peak_x: int         # canvas px, the LoG peak the candidate started from
    peak_y: int
    features: dict[str, float]


# ---------------------------------------------------------------- helpers

def gaussian_kernel(sigma: float) -> np.ndarray:
    """1-D Gaussian, radius ceil(3 sigma), normalised to sum 1. Built from the
    formula so the port needs no lookup table."""
    r = int(math.ceil(3 * sigma))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-(x * x) / (2 * sigma * sigma))
    return k / k.sum()


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    k = gaussian_kernel(sigma)
    return cv2.sepFilter2D(img, cv2.CV_64F, k, k, borderType=cv2.BORDER_REFLECT_101)


def laplacian4(img: np.ndarray) -> np.ndarray:
    """4-neighbour Laplacian, BORDER_REFLECT_101 (cv2.Laplacian with ksize=1)."""
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], np.float64)
    return cv2.filter2D(img, cv2.CV_64F, k, borderType=cv2.BORDER_REFLECT_101)


def downsample2(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape[0] // HALF, gray.shape[1] // HALF
    g = gray[:h * HALF, :w * HALF].astype(np.float64)
    return (g[0::2, 0::2] + g[0::2, 1::2] + g[1::2, 0::2] + g[1::2, 1::2]) / 4.0


def label8(mask: np.ndarray):
    """8-connected components of a boolean mask: (count, labels, stats) with
    stats rows (x, y, w, h, area), background label 0."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    return n, lab, st


def dilate_square(mask: np.ndarray, radius: int) -> np.ndarray:
    k = np.ones((2 * radius + 1, 2 * radius + 1), np.uint8)
    return cv2.dilate(mask.astype(np.uint8), k) > 0


def erode_square(mask: np.ndarray, radius: int) -> np.ndarray:
    k = np.ones((2 * radius + 1, 2 * radius + 1), np.uint8)
    return cv2.erode(mask.astype(np.uint8), k, borderType=cv2.BORDER_CONSTANT, borderValue=0) > 0


def max_filter(img: np.ndarray, radius: int) -> np.ndarray:
    k = np.ones((2 * radius + 1, 2 * radius + 1), np.uint8)
    return cv2.dilate(img, k, borderType=cv2.BORDER_CONSTANT, borderValue=-np.inf)


def median(values: np.ndarray) -> float:
    """numpy's median: the mean of the two middle values for an even count."""
    return float(np.median(values)) if values.size else 0.0


def valid_mask(half: np.ndarray) -> np.ndarray:
    white = half >= PAD_WHITE
    n, lab, st = label8(white)
    h, w = half.shape
    bad = np.zeros(half.shape, bool)
    for i in range(1, n):
        x, y, cw, ch, a = (int(v) for v in st[i])
        if a < PAD_MIN_AREA:
            continue
        if x == 0 or y == 0 or x + cw >= w or y + ch >= h:
            bad |= lab == i
    return ~dilate_square(bad, PAD_GROW)


# ---------------------------------------------------------------- the stage

@dataclass
class Face:
    """What the stage knows about the face: the canvas centre in px, the scale,
    the hole diameter and the ring layout in mm."""
    cx: float
    cy: float
    px_per_mm: float
    caliber_mm: float
    black_radius_mm: float
    max_radius_mm: float
    ring_radii_mm: tuple[float, ...]

    @property
    def d(self) -> float:
        return self.caliber_mm * self.px_per_mm


def radius_map_mm(shape, face: Face, scale: int) -> np.ndarray:
    """Distance from the centre in mm at each pixel of a canvas downsampled by
    `scale`; a downsampled pixel is measured at the centre of its block."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    xs = xx * scale + (scale - 1) / 2.0
    ys = yy * scale + (scale - 1) / 2.0
    return np.hypot(xs - face.cx, ys - face.cy) / face.px_per_mm


def ring_distance_mm(r_mm: float, face: Face) -> float:
    return min(abs(r_mm - rr) for rr in face.ring_radii_mm)


def compute_maps(gray: np.ndarray, face: Face):
    half = downsample2(gray)
    rmm = radius_map_mm(half.shape, face, HALF)
    valid = valid_mask(half)
    black = rmm <= BLACK_ZONE_FRACTION * face.black_radius_mm
    inzone = (rmm <= face.max_radius_mm) & valid
    d_half = face.d / HALF
    sigma1 = d_half / (2 * math.sqrt(2))
    logs = {}
    for name, s in (("s1", sigma1), ("s2", 2 * sigma1), ("s05", 0.5 * sigma1)):
        lap = laplacian4(blur(half, s))
        # The MAD over every 4th pixel in each direction of the scoring area:
        # a 1/16 sample is statistically the same number and keeps the two
        # exact medians affordable where the port runs.
        z = lap[::MAD_STRIDE, ::MAD_STRIDE][inzone[::MAD_STRIDE, ::MAD_STRIDE]]
        mad = max(median(np.abs(z - median(z))), MAD_FLOOR[name]) + 1e-3
        logs[name] = lap / mad
    # printed-glyph extent map
    lines = np.zeros(half.shape, bool)
    for rr in face.ring_radii_mm:
        lines |= np.abs(rmm - rr) <= LINE_HALF_WIDTH_MM
    glyph = np.zeros(half.shape, np.float64)
    for zone in (black & inzone, (~black) & inzone):
        if zone.sum() < 100:
            continue
        bg = median(half[zone])
        struct = (np.abs(half - bg) > GLYPH_DELTA) & zone & ~lines
        struct = erode_square(dilate_square(struct, 1), 1)  # 3x3 closing
        n, lab, st = label8(struct)
        ext = np.zeros(n, np.float64)
        for i in range(1, n):
            ext[i] = max(int(st[i][2]), int(st[i][3])) / d_half
        glyph = np.maximum(glyph, ext[lab])
    glyph = cv2.dilate(glyph, np.ones((3, 3), np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0)
    return dict(half=half, valid=valid, black=black, inzone=inzone, logs=logs, glyph=glyph, d_half=d_half)


def find_peaks(maps, face: Face) -> list[tuple[int, int, float]]:
    """(x, y, |LoG| in MADs) at full-res px for each local maximum."""
    resp = np.abs(maps["logs"]["s1"])
    radius = int(round(NMS_RADIUS_D * maps["d_half"]))
    mx = max_filter(resp, radius)
    pk = (resp >= mx) & (resp >= LOG_THRESHOLD_MAD) & maps["inzone"]
    ys, xs = np.nonzero(pk)
    # full-res position: the lower-right pixel of the 2x2 block, an integer
    return [(int(x) * HALF + 1, int(y) * HALF + 1, float(resp[y, x])) for x, y in zip(xs, ys)]


def window(gray: np.ndarray, x0: int, y0: int, radius: int):
    """The clipped square window around (x0, y0) and its coordinate grids."""
    h, w = gray.shape
    ya, yb = max(0, y0 - radius), min(h, y0 + radius + 1)
    xa, xb = max(0, x0 - radius), min(w, x0 + radius + 1)
    patch = gray[ya:yb, xa:xb].astype(np.float64)
    yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float64)
    return patch, xx, yy, xa, ya


def radial_bins(gray: np.ndarray, x0: int, y0: int, d: float, in_black: bool):
    patch, xx, yy, _, _ = window(gray, x0, y0, int(2.5 * d) + 1)
    rr = np.hypot(xx - x0, yy - y0) / d
    bgm = (rr >= 1.5) & (rr <= 2.5)
    bg = median(patch[bgm]) if bgm.sum() > 10 else float(patch.mean())
    sign = 1.0 if in_black else -1.0
    bins = []
    for a, b in ((0, 0.25), (0.25, 0.5), (0.5, 0.75), (0.75, 1.0), (1.0, 1.5)):
        m = (rr >= a) & (rr < b)
        bins.append(sign * (float(patch[m].mean()) - bg) if m.sum() > 0 else 0.0)
    peak = max(1.0, max(abs(v) for v in bins))
    return bins, [v / peak for v in bins], bg, sign


def blob_shape(gray: np.ndarray, x0: int, y0: int, d: float, bg: float, sign: float):
    patch, _, _, xa, ya = window(gray, x0, y0, int(1.3 * d) + 1)
    dev = sign * (patch - bg)
    cy, cx = y0 - ya, x0 - xa
    c = float(dev[max(0, cy - 2):cy + 3, max(0, cx - 2):cx + 3].mean())
    if c <= 4:
        return [0.0, 0.0, 0.0, 0.0]
    bw = dev >= 0.5 * c
    n, lab, st = label8(bw)
    l = int(lab[cy, cx])
    if l == 0:
        return [0.0, 0.0, 0.0, 0.0]
    x, y, bw_, bh_, area = (float(v) for v in st[l])
    unit = math.pi * (d / 2) ** 2
    ext = max(bw_, bh_)
    fill = area / (math.pi / 4 * ext * ext) if ext > 0 else 0.0
    elong = ext / max(1.0, min(bw_, bh_))
    touches = 1.0 if (x == 0 or y == 0 or x + bw_ >= bw.shape[1] or y + bh_ >= bw.shape[0]) else 0.0
    return [min(area / unit, BLOB_AREA_CLIP), fill, min(elong, BLOB_ELONG_CLIP), touches]


def edge_straightness(gray: np.ndarray, x0: int, y0: int, d: float) -> float:
    patch, _, _, _, _ = window(gray, x0, y0, int(0.75 * d) + 1)
    g = patch / 255.0
    gx = cv2.Sobel(g, cv2.CV_64F, 1, 0, ksize=3, borderType=cv2.BORDER_REFLECT_101)
    gy = cv2.Sobel(g, cv2.CV_64F, 0, 1, ksize=3, borderType=cv2.BORDER_REFLECT_101)
    # A gradient this small is a rounding residue of the convolution, and the
    # residue's sign would otherwise pick the bin for an edge that is exactly
    # horizontal or vertical. Snapped to zero on both sides of the port.
    gx[np.abs(gx) < GRADIENT_EPSILON] = 0.0
    gy[np.abs(gy) < GRADIENT_EPSILON] = 0.0
    mag = np.hypot(gx, gy).ravel()
    ang = np.arctan2(gy, gx).ravel() % math.pi
    # Binned by hand rather than np.histogram so the port can reproduce the
    # bin edges exactly: edge i is i * (pi / 18), and an angle on an edge goes up.
    hist = np.zeros(STRAIGHT_BINS)
    step = math.pi / STRAIGHT_BINS
    for a, m in zip(ang, mag):
        b = min(STRAIGHT_BINS - 1, int(a / math.pi * STRAIGHT_BINS))
        if a < b * step:
            b -= 1
        elif b < STRAIGHT_BINS - 1 and a >= (b + 1) * step:
            b += 1
        hist[b] += m
    tot = float(hist.sum()) + 1e-9
    top = float(np.sort(hist)[-2:].sum())
    return top / tot


def crop48(gray: np.ndarray, x0: int, y0: int) -> np.ndarray:
    """The HF crop, reflected at the canvas rim (BORDER_REFLECT_101)."""
    n = HF.CROP
    h, w = gray.shape
    ys = [reflect(y0 - n // 2 + i, h) for i in range(n)]
    xs = [reflect(x0 - n // 2 + i, w) for i in range(n)]
    return gray[np.ix_(ys, xs)]


def reflect(i: int, size: int) -> int:
    if size == 1:
        return 0
    while i < 0 or i >= size:
        if i < 0:
            i = -i
        if i >= size:
            i = 2 * size - 2 - i
    return i


def features_at(gray: np.ndarray, x0: int, y0: int, maps, face: Face) -> dict[str, float]:
    d = face.d
    r_mm = math.hypot(x0 - face.cx, y0 - face.cy) / face.px_per_mm
    in_black = r_mm <= BLACK_ZONE_FRACTION * face.black_radius_mm
    sgn = 1.0 if in_black else -1.0
    f = dict(HF.features(crop48(gray, x0, y0)))
    f["in_black"] = 1.0 if in_black else 0.0
    f["ring_dist"] = min(ring_distance_mm(r_mm, face), RING_DIST_CLIP_MM)
    f["r_mm"] = r_mm
    hx, hy = x0 // HALF, y0 // HALF
    logs = maps["logs"]
    # a hole in the black zone is bright, so its Laplacian is negative
    f["log1"] = -sgn * float(logs["s1"][hy, hx])
    f["log2"] = -sgn * float(logs["s2"][hy, hx])
    f["log05"] = -sgn * float(logs["s05"][hy, hx])
    f["abslog1"] = abs(f["log1"])
    f["scale_ratio"] = f["log1"] / (abs(f["log2"]) + 1.0)
    bins, nb, bg, sign = radial_bins(gray, x0, y0, d, in_black)
    for i, v in enumerate(bins):
        f[f"rb{i}"] = v
    for i, v in enumerate(nb):
        f[f"nrb{i}"] = v
    f["b_area"], f["b_fill"], f["b_elong"], f["b_touch"] = blob_shape(gray, x0, y0, d, bg, sign)
    f["straight"] = edge_straightness(gray, x0, y0, d)
    f["glyph"] = min(float(maps["glyph"][hy, hx]), GLYPH_CLIP)
    return f


def probability(f: dict[str, float], weights=None, bias=None) -> float:
    w = WEIGHTS if weights is None else weights
    b = BIAS if bias is None else bias
    if not w:
        raise RuntimeError("hole_proposals.WEIGHTS is unfitted — run fit_hole_proposals.py")
    z = b + sum(w[k] * f[k] for k in FEATURE_NAMES)
    return 1.0 / (1.0 + math.exp(-z))


def refine_center(gray: np.ndarray, x: float, y: float, d: float, bg: float, sign: float):
    R = int(REFINE_RADIUS_D * d) + 1
    cx, cy = float(x), float(y)
    for _ in range(REFINE_ITERS):
        x0, y0 = int(round(cx)), int(round(cy))
        patch, xx, yy, _, _ = window(gray, x0, y0, R)
        rr = np.hypot(xx - cx, yy - cy)
        wgt = np.clip(sign * (patch - bg), 0, None) * (rr <= REFINE_RADIUS_D * d)
        s = float(wgt.sum())
        if s < 1e-3:
            break
        cx = float((wgt * xx).sum() / s)
        cy = float((wgt * yy).sum() / s)
    return cx, cy


def candidates(gray: np.ndarray, face: Face):
    """Every peak with its features and probability, unfiltered — what the
    evaluation and the fit consume."""
    maps = compute_maps(gray, face)
    out = []
    for x0, y0, resp in find_peaks(maps, face):
        f = features_at(gray, x0, y0, maps, face)
        out.append(dict(x=x0, y=y0, resp=resp, features=f))
    return out


def propose(gray: np.ndarray, face: Face, threshold: float = THRESHOLD) -> list[Proposal]:
    accepted = []
    for c in candidates(gray, face):
        p = probability(c["features"])
        if p >= threshold:
            accepted.append((p, c))
    accepted.sort(key=lambda t: -t[0])
    kept: list[Proposal] = []
    for p, c in accepted:
        if any(math.hypot(c["x"] - k.peak_x, c["y"] - k.peak_y) < MERGE_RADIUS_D * face.d for k in kept):
            continue
        in_black = c["features"]["in_black"] > 0.5
        _, _, bg, sign = radial_bins(gray, c["x"], c["y"], face.d, in_black)
        rx, ry = refine_center(gray, c["x"], c["y"], face.d, bg, sign)
        kept.append(Proposal(rx, ry, p, c["x"], c["y"], c["features"]))
    return kept
