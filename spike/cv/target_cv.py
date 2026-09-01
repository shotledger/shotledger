"""Classical-CV pipeline for scoring Swedish 25 m pistol targets.

Spike code: crude on purpose. Stages are deliberately separable so the
report can say which stage fails on which photo.

  1. find_face()   locate the printed target face via its black zone
  2. build_geom()  black-zone ellipse -> circle homography + mm scale
  3. refine_geom() radial profile against the known ring radii
  4. find_holes()  bright blobs on black paper / dark blobs on light paper
  5. score_hole()  radius in mm -> ring value, SHB F.6.10.1 edge rule
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

# --- domain: docs/reference/spsf-shb-2026.md (F.7.1 p.182, J.7.1 p.297) ---

# (label, diameter mm), outermost last. "X" is an inner tiebreak of ring 10.
PRECISION_RINGS = [
    ("X", 25.0), ("10", 50.0), ("9", 100.0), ("8", 150.0), ("7", 200.0),
    ("6", 250.0), ("5", 300.0), ("4", 350.0), ("3", 400.0), ("2", 450.0),
    ("1", 500.0),
]
MILSNABB_RINGS = [
    ("X", 50.0), ("10", 100.0), ("9", 180.0), ("8", 260.0), ("7", 340.0),
    ("6", 420.0), ("5", 500.0),
]

BULLET_MM = 5.6  # .22 LR

TARGETS = {
    # black_mm: outer diameter of the printed black zone, the anchor we fit
    "precision": dict(rings=PRECISION_RINGS, black_mm=200.0, black_solid=True),
    "milsnabb": dict(rings=MILSNABB_RINGS, black_mm=500.0, black_solid=False),
}


@dataclass
class Geometry:
    center: tuple[float, float]      # in rectified pixels
    px_per_mm: float
    H: np.ndarray                    # original -> rectified
    ellipse: tuple                   # black-zone fit in original pixels
    partial: bool                    # black zone clipped by the frame
    ring_fit_err_mm: float | None = None


@dataclass
class Hole:
    x: float                         # rectified px
    y: float
    r_px: float
    polarity: str                    # "bright" (on black) / "dark" (on paper)
    score: str = ""
    r_mm: float = 0.0
    edge_mm: float = 0.0
    margin_mm: float = 0.0           # distance from the ring line it scored on
    notes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- stage 1

def load(path: str, long_side: int = 2048) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    h, w = img.shape[:2]
    s = long_side / max(h, w)
    if s < 1.0:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return img


def find_face(img: np.ndarray) -> tuple[tuple, bool, np.ndarray]:
    """Largest dark blob = the printed black zone. Returns (ellipse, partial, mask).

    Fitting the ellipse to the blob's *outer* contour handles the milsnabb
    target, whose black zone is an annulus around a lighter middle.
    """
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (7, 7), 0)
    # Otsu on a heavily blurred copy: we want the paper/black split, not texture.
    _, mask = cv2.threshold(cv2.GaussianBlur(g, (31, 31), 0), 0, 255,
                            cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    k = np.ones((9, 9), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        raise SystemExit("no dark region found")
    c = max(cnts, key=cv2.contourArea)

    h, w = mask.shape
    pts = c.reshape(-1, 2).astype(np.float32)
    m = 3
    inside = pts[(pts[:, 0] > m) & (pts[:, 0] < w - 1 - m) &
                 (pts[:, 1] > m) & (pts[:, 1] < h - 1 - m)]
    partial = len(inside) < 0.95 * len(pts)
    fit_pts = inside if len(inside) >= 200 else pts
    # fitEllipseDirect is markedly better than the default on partial arcs,
    # which is what a phone photo of a cropped target card gives us.
    ellipse = cv2.fitEllipseDirect(fit_pts.astype(np.float32))

    filled = np.zeros_like(mask)
    cv2.drawContours(filled, [c], -1, 255, -1)
    ellipse = _refit_rays(filled, ellipse)
    return ellipse, partial, filled


def _refit_rays(mask, ellipse, iters=3, nray=360):
    """Re-fit the black-zone boundary from ray casts, dropping rays that leave
    the frame. Much steadier than one contour fit when the card is cropped."""
    h, w = mask.shape
    for _ in range(iters):
        (cx, cy), (d1, d2), ang = ellipse
        rmax = 0.75 * max(h, w)
        pts = []
        for a in np.linspace(0, 2 * np.pi, nray, endpoint=False):
            last = None
            for r in np.arange(2, rmax, 1.5):
                x, y = int(cx + r * math.cos(a)), int(cy + r * math.sin(a))
                if not (2 < x < w - 3 and 2 < y < h - 3):
                    last = None          # ray left the frame: unusable
                    break
                if mask[y, x]:
                    last = (x, y)
            if last:
                pts.append(last)
        if len(pts) < 30:
            return ellipse
        ellipse = cv2.fitEllipseDirect(np.array(pts, np.float32))
    return ellipse


def guess_kind(img: np.ndarray, ellipse: tuple) -> str:
    """precision = solid black disc; milsnabb = black annulus, lighter middle."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    (cx, cy), (MA, ma), _ = ellipse
    rin = 0.18 * min(MA, ma) / 2
    rmid = 0.80 * min(MA, ma) / 2
    inner = _disc_mean(g, cx, cy, rin)
    ring = _annulus_mean(g, cx, cy, 0.80 * rmid, rmid)
    return "precision" if inner < ring + 25 else "milsnabb"


def _disc_mean(g, cx, cy, r):
    m = np.zeros(g.shape, np.uint8)
    cv2.circle(m, (int(cx), int(cy)), max(2, int(r)), 255, -1)
    return cv2.mean(g, m)[0]


def _annulus_mean(g, cx, cy, r0, r1):
    m = np.zeros(g.shape, np.uint8)
    cv2.circle(m, (int(cx), int(cy)), int(r1), 255, -1)
    cv2.circle(m, (int(cx), int(cy)), int(r0), 0, -1)
    return cv2.mean(g, m)[0]


# ---------------------------------------------------------------- stage 2

def build_geom(img, ellipse, kind, partial, out_px_per_mm=4.0):
    """Ellipse -> circle. Weak-perspective (affine) rectification.

    A single conic does not determine a full homography, so we undo only
    rotation + anisotropic scale. Good for near-frontal phone photos; the
    residual error under real tilt is what the report measures.
    """
    spec = TARGETS[kind]
    (cx, cy), (d_minor, d_major), ang = ellipse
    r_out = spec["black_mm"] / 2 * out_px_per_mm

    th = math.radians(ang)
    R = np.array([[math.cos(th), math.sin(th)],
                  [-math.sin(th), math.cos(th)]])
    S = np.diag([2 * r_out / d_minor, 2 * r_out / d_major])
    A = S @ R
    size = int(round(2.6 * r_out))
    t = np.array([size / 2, size / 2]) - A @ np.array([cx, cy])
    H = np.vstack([np.hstack([A, t.reshape(2, 1)]), [0, 0, 1]])
    rect = cv2.warpPerspective(img, H, (size, size), flags=cv2.INTER_CUBIC,
                               borderValue=(255, 255, 255))
    return rect, Geometry((size / 2, size / 2), out_px_per_mm, H, ellipse, partial)


# ---------------------------------------------------------------- stage 3

def refine_geom(rect, geom: Geometry, kind: str, search_mm=10.0):
    """Lock centre + scale onto the printed ring lines via a radial profile.

    The ring lines are the strongest thin concentric structure on the card,
    so a 1-D radial *edge* profile peaks at the known ring radii. We grid
    search dx, dy and scale and keep the best template score. This is also
    the only thing that rescues geometry when the black zone was clipped
    and the conic fit was therefore poor.
    """
    spec = TARGETS[kind]
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY).astype(np.float32)
    radii = [d / 2 for _, d in spec["rings"]]
    rmax_mm = spec["rings"][-1][1] / 2 * 1.05

    cx0, cy0 = geom.center
    best = (0.0, 0.0, 1.0, -1e9)
    step = 2.0
    for _ in range(3):                     # coarse-to-fine
        bdx, bdy, bsc, _bv = best
        cand = (0.0, 0.0, 1.0, -1e9)
        for dx in np.arange(bdx - search_mm, bdx + search_mm + .01, step):
            for dy in np.arange(bdy - search_mm, bdy + search_mm + .01, step):
                prof = _radial_profile(g, cx0 + dx * geom.px_per_mm,
                                       cy0 + dy * geom.px_per_mm,
                                       int(rmax_mm * geom.px_per_mm))
                for sc in np.arange(bsc - 0.12, bsc + 0.121, 0.02 * step / 2):
                    v, n = 0.0, 0
                    for rm in radii:
                        r = int(rm * geom.px_per_mm * sc)
                        lo, hi = max(0, r - 2), r + 3
                        if hi < len(prof):
                            v += float(prof[lo:hi].max())
                            n += 1
                    if n:
                        v /= n
                        if v > cand[3]:
                            cand = (dx, dy, sc, v)
        best = cand
        search_mm, step = step * 1.5, max(0.5, step / 3)

    dx, dy, sc, _ = best
    geom.center = (cx0 + dx * geom.px_per_mm, cy0 + dy * geom.px_per_mm)
    geom.px_per_mm = geom.px_per_mm * sc
    geom.ring_fit_err_mm = abs(1 - sc) * spec["black_mm"] / 2
    return geom


def _radial_profile(g, cx, cy, rmax, nang=540):
    """Mean intensity along radius, high-pass filtered -> thin-line response
    (abs, so it fires on both a white line on black and a black line on white)."""
    ang = np.linspace(0, 2 * np.pi, nang, endpoint=False)
    rs = np.arange(0, max(4, rmax))
    xs = np.clip(cx + np.outer(rs, np.cos(ang)), 0, g.shape[1] - 1).astype(np.float32)
    ys = np.clip(cy + np.outer(rs, np.sin(ang)), 0, g.shape[0] - 1).astype(np.float32)
    prof = cv2.remap(g, xs, ys, cv2.INTER_LINEAR).mean(axis=1)
    lp = cv2.GaussianBlur(prof.reshape(-1, 1), (1, 21), 0).ravel()
    return np.abs(prof - lp)


def ring_residuals(rect, geom: Geometry, kind: str, win_mm=3.0):
    """Per-ring distance from the drawn ring to the printed line it should sit
    on: peak of the angular-mean radial edge profile within +-win_mm of the
    nominal radius. This is the geometry accuracy number the report quotes."""
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cx, cy = geom.center
    rmax = int(TARGETS[kind]["rings"][-1][1] / 2 * geom.px_per_mm * 1.1)
    prof = _radial_profile(g, cx, cy, rmax)
    out = []
    for label, dia in TARGETS[kind]["rings"]:
        r = dia / 2 * geom.px_per_mm
        w = win_mm * geom.px_per_mm
        lo, hi = int(max(0, r - w)), int(min(len(prof), r + w + 1))
        if hi - lo < 3:
            out.append((label, None))
            continue
        peak = lo + int(np.argmax(prof[lo:hi]))
        out.append((label, (peak - r) / geom.px_per_mm))
    return out


# ---------------------------------------------------------------- stage 4

def find_holes(rect, geom: Geometry, kind: str, variant: str = "v1") -> list[Hole]:
    """`v1` is the phase-1 detector. `v2` is the corpus-v2 improvement round,
    which **measured no better** (identical recall, slightly worse precision --
    see the Corpus v2 section of the report) and is therefore not the default;
    it is kept so the before/after is reproducible rather than asserted. Its
    three changes were:

      * a **dark-on-black** channel, with a threshold relative to the black
        zone's own spread. Phase 1 only looked for bright tears in the black
        zone, because every fresh hole in its 5 photos showed white backing
        board. On the 38-photo corpus a large minority of photos have holes
        that read as *dark* pits -- no backing light at all -- and those were
        structurally undetectable, not merely missed. It found one new hole,
        lost another, and added six false positives.
      * a **local-contrast** gate, needed to keep that channel from returning
        paper texture.
      * an explicit **scoring-area** cut: a candidate outside the outermost
        ring cannot be a shot.
    """
    spec = TARGETS[kind]
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    d_px = BULLET_MM * geom.px_per_mm
    cx, cy = geom.center
    black_r = spec["black_mm"] / 2 * geom.px_per_mm
    max_r = spec["rings"][-1][1] / 2 * geom.px_per_mm

    inzone = np.zeros(g.shape, np.uint8)
    cv2.circle(inzone, (int(cx), int(cy)), int(max_r), 255, -1)
    blackzone = np.zeros(g.shape, np.uint8)
    cv2.circle(blackzone, (int(cx), int(cy)), int(black_r * 0.985), 255, -1)
    if not spec["black_solid"]:
        blackzone[:] = 0  # milsnabb middle is not reliably black; treat all as paper
        cv2.circle(blackzone, (int(cx), int(cy)), int(max_r * 0.985), 255, -1)
        cv2.circle(blackzone, (int(cx), int(cy)),
                   int(spec["rings"][4][1] / 2 * geom.px_per_mm), 0, -1)
    paperzone = cv2.bitwise_and(inzone, cv2.bitwise_not(blackzone))

    # keep clear of the card edge / background, which is a strong blob source
    card = _card_mask(rect)
    inzone = cv2.bitwise_and(inzone, card)
    blackzone = cv2.bitwise_and(blackzone, card)
    paperzone = cv2.bitwise_and(inzone, cv2.bitwise_not(blackzone))

    # Kernel deliberately much larger than a hole (~3.5x). With a kernel
    # smaller than a printed ring digit the top-hat keeps only the digit's
    # strokes, which fragment into hole-sized blobs; oversizing it keeps the
    # digit whole so the size filter can throw it away.
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                  (max(3, int(d_px * 3.5)) | 1,) * 2)
    lines = _ring_line_mask(g.shape, geom, kind, d_px)
    paper = _paper_colour(rect, paperzone)
    tophat = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, k)
    blackhat = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k)
    holes: list[Hole] = []
    holes += _blobs(tophat, g, blackzone, d_px, "bright", lines, rect, paper,
                    variant)
    holes += _blobs(blackhat, g, paperzone, d_px, "dark", lines, rect, paper,
                    variant)
    if variant != "v1":
        # dark tears inside the black zone: invisible to the phase-1 detector
        holes += _blobs(blackhat, g, blackzone, d_px, "dark_black", lines,
                        rect, None, variant)
        holes = [h for h in holes
                 if math.hypot(h.x - cx, h.y - cy) <= max_r]
    return _dedupe(holes, d_px)


def _ring_line_mask(shape, geom: Geometry, kind: str, d_px):
    """Where the printed ring lines are, from the fitted geometry. Removing
    them lets a connected-component size test tell a printed digit (large,
    isolated) from a bullet hole (small) without the lines gluing everything
    into one component."""
    m = np.zeros(shape, np.uint8)
    c = (int(geom.center[0]), int(geom.center[1]))
    for _, dia in TARGETS[kind]["rings"]:
        cv2.circle(m, c, int(dia / 2 * geom.px_per_mm), 255,
                   max(3, int(0.35 * d_px)))
    return m


def _card_mask(rect):
    """Erode away the printed card's border so the card/background step and
    the warp's white padding cannot masquerade as holes."""
    g = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    m = ((g > 8) & (g < 250)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m = (lab == big).astype(np.uint8) * 255
    return cv2.erode(m, np.ones((17, 17), np.uint8))


def _paper_colour(rect, paperzone):
    """Median colour of the card's light zone -- the colour the printed ring
    digits are knocked out in."""
    m = paperzone > 0
    if m.sum() < 500:
        return None
    px = rect[m].reshape(-1, 3).astype(np.float32)
    px = px[px.mean(axis=1) > np.percentile(px.mean(axis=1), 40)]
    return np.median(px, axis=0)


def _colour_dist(rect, pix_mask, paper_bgr):
    patch = rect[pix_mask].reshape(-1, 3).astype(np.float32)
    if not len(patch):
        return 999.0
    c = np.median(patch, axis=0)
    # compare hue/chroma, not brightness: exposure varies across the card
    return float(abs((c[2] - c[0]) - (paper_bgr[2] - paper_bgr[0])) +
                 abs((c[1] - c[0]) - (paper_bgr[1] - paper_bgr[0])))


def _blobs(resp, gray, zone, d_px, polarity, lines, rect_bgr=None,
           paper_bgr=None, variant="v2"):
    resp = cv2.bitwise_and(resp, resp, mask=zone)
    if resp.max() < 12:
        return []
    vals = resp[zone > 0]
    thr = max(12, int(np.percentile(vals[vals > 0], 93)) if (vals > 0).any() else 255)
    thr = min(thr, int(0.40 * resp.max()))
    _, bw = cv2.threshold(resp, thr, 255, cv2.THRESH_BINARY)
    bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # Same response at a low threshold: a hole stays a small island, whereas a
    # bright fragment that is really part of a printed digit or a ring line
    # grows into its parent structure. This is what actually kills the digits.
    # "Structure" mask straight off the raw image: everything printed or torn
    # that stands out from the local paper level. The top-hat's own response
    # saturates on printed glyphs, so thresholding *it* cannot separate a
    # glyph fragment from a hole -- this can.
    bg = float(np.median(gray[zone > 0])) if (zone > 0).any() else 128.0
    if polarity == "dark_black":
        # A fixed -35 offset is meaningless in a black zone whose own level is
        # ~65 with a floor at ~50: it lands below every pixel, which is why
        # this channel returns nothing unless the threshold is relative to the
        # zone's own spread. Measured: applying the same relative rule to the
        # other two channels *costs* true positives, so it stays local here.
        z = gray[zone > 0].astype(np.float32)
        mad = float(np.median(np.abs(z - bg))) if z.size else 12.0
        delta = float(np.clip(2.5 * mad, 8.0, 35.0))
    else:
        delta = 35.0
    if polarity == "bright":
        bw_lo = ((gray.astype(np.int16) > bg + delta) & (zone > 0)).astype(np.uint8) * 255
    else:
        bw_lo = ((gray.astype(np.int16) < bg - delta) & (zone > 0)).astype(np.uint8) * 255
    bw_lo = cv2.bitwise_and(bw_lo, cv2.bitwise_not(lines))
    bw_lo = cv2.morphologyEx(bw_lo, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    nlo, lablo, statlo, _ = cv2.connectedComponentsWithStats(bw_lo, 8)

    n, lab, stats, cent = cv2.connectedComponentsWithStats(bw, 8)
    # Size by largest inscribed disc, not by bounding box: a hole that clips a
    # printed ring line merges with it, and a bbox/aspect test then throws the
    # hole away. The inscribed radius ignores the thin line it hangs off.
    dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
    a_lo, a_hi = 0.30 * math.pi * (d_px / 2) ** 2, 8.0 * math.pi * (d_px / 2) ** 2
    out = []
    for i in range(1, n):
        a = int(stats[i, cv2.CC_STAT_AREA])
        if not (a_lo <= a <= a_hi):
            continue
        sel = lab == i
        dt = float(dist[sel].max())
        if not (0.26 * d_px <= dt <= 0.95 * d_px):
            continue
        cx, cy = float(cent[i][0]), float(cent[i][1])
        if a > 2.0 * math.pi * (d_px / 2) ** 2:
            # line-merged: recentre on the widest part, not the merged centroid
            ys, xs = np.nonzero(sel & (dist >= dt - 1))
            cx, cy = float(xs.mean()), float(ys.mean())
        # A high threshold clips a printed digit into compact, hole-sized
        # fragments, so judge the candidate by the *whole* structure it
        # belongs to at a low threshold (ring lines already removed).
        # (Sample the structure labels the blob's own pixels touch -- the
        # centroid of a glyph like "6" or "8" falls in a counter, where the
        # structure mask is empty.)
        js = [int(j) for j in np.unique(lablo[sel]) if j > 0]
        if not js:
            continue
        bad = False
        for j in js:
            sw = int(statlo[j, cv2.CC_STAT_WIDTH])
            sh = int(statlo[j, cv2.CC_STAT_HEIGHT])
            if max(sw, sh) > 2.6 * d_px:
                bad = True                 # far too big to be a .22 hole
                break
        if bad:
            continue
        # A ring digit inside the black zone is a knockout: it is exactly the
        # card's own paper colour. A hole shows whatever is behind the card
        # (here neutral-white backing), which is measurably different. Shape
        # does NOT work here -- a torn hole is jagged, so a solidity test
        # rejects the real holes and keeps the smooth glyphs.
        if polarity == "bright" and paper_bgr is not None:
            if _colour_dist(rect_bgr, sel, paper_bgr) < 4.0:
                continue
        if not _has_dark_core(gray, cx, cy, d_px, polarity):
            continue
        if variant != "v1" and not _local_contrast(gray, sel, cx, cy, d_px,
                                                   polarity):
            continue
        out.append(Hole(cx, cy, math.sqrt(a / math.pi), polarity))
    return out


def _context_frac(bw, cx, cy, r0, r1):
    m = np.zeros(bw.shape, np.uint8)
    cv2.circle(m, (int(cx), int(cy)), int(r1), 255, -1)
    cv2.circle(m, (int(cx), int(cy)), int(r0), 0, -1)
    return cv2.mean(bw, m)[0] / 255.0


def _local_contrast(gray, sel, cx, cy, d_px, polarity, need=5.0):
    """A hole differs from the paper immediately around it. Sensor noise and
    paper texture do not, and that is most of what the new dark-on-black
    channel would otherwise return."""
    ring = np.zeros(gray.shape, np.uint8)
    cv2.circle(ring, (int(cx), int(cy)), int(2.2 * d_px), 255, -1)
    cv2.circle(ring, (int(cx), int(cy)), int(1.2 * d_px), 0, -1)
    around = gray[(ring > 0) & ~sel]
    if around.size < 50:
        return True
    d = float(np.median(gray[sel])) - float(np.median(around))
    return d >= need if polarity == "bright" else -d >= need


def _has_dark_core(gray, cx, cy, d_px, polarity):
    """Disabled: on these photos a .22 hole in the black zone reads as a solid
    bright tear (light backing board), not a dark pit, so the core/ring test
    rejected real holes. Kept as a hook -- the discriminator that actually
    works here is the over-sized top-hat kernel in find_holes()."""
    return True


def _dedupe(holes, d_px):
    keep = []
    for h in sorted(holes, key=lambda h: -h.r_px):
        if all(math.hypot(h.x - k.x, h.y - k.y) > 0.8 * d_px for k in keep):
            keep.append(h)
    return keep


# ---------------------------------------------------------------- stage 5

def score_hole(h: Hole, geom: Geometry, kind: str) -> Hole:
    """SHB F.6.10.1: a hole counts to the higher value as soon as the ring's
    outer edge is tangented -> compare the hole's *inner* edge to the ring."""
    spec = TARGETS[kind]
    cx, cy = geom.center
    h.r_mm = math.hypot(h.x - cx, h.y - cy) / geom.px_per_mm
    h.edge_mm = max(0.0, h.r_mm - BULLET_MM / 2)
    h.score = "0"
    h.margin_mm = 0.0
    for label, dia in spec["rings"]:
        if h.edge_mm <= dia / 2:
            h.score = label
            h.margin_mm = dia / 2 - h.edge_mm
            break
    if h.score != "0" and h.margin_mm < 1.0:
        h.notes.append(f"edge call ({h.margin_mm:.1f} mm)")
    return h


def ring_value(score: str) -> int:
    return 10 if score == "X" else int(score)


# ---------------------------------------------------------------- drawing

def annotate(rect, geom: Geometry, kind: str, holes: list[Hole]) -> np.ndarray:
    spec = TARGETS[kind]
    out = rect.copy()
    cx, cy = int(geom.center[0]), int(geom.center[1])
    for label, dia in spec["rings"]:
        r = int(dia / 2 * geom.px_per_mm)
        cv2.circle(out, (cx, cy), r, (0, 200, 255), 1, cv2.LINE_AA)
        cv2.putText(out, label, (cx + r - 14, cy - 4), cv2.FONT_HERSHEY_SIMPLEX,
                    0.45, (0, 200, 255), 1, cv2.LINE_AA)
    cv2.drawMarker(out, (cx, cy), (0, 200, 255), cv2.MARKER_CROSS, 18, 1)
    for i, h in enumerate(holes, 1):
        p = (int(h.x), int(h.y))
        col = (60, 60, 255) if h.notes else (60, 255, 60)
        cv2.circle(out, p, int(max(6, BULLET_MM / 2 * geom.px_per_mm)), col, 2, cv2.LINE_AA)
        cv2.putText(out, f"{i}:{h.score}", (p[0] + 10, p[1] - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2, cv2.LINE_AA)
    return out
