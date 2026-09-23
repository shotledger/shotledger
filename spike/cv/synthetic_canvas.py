"""A synthetic rectified canvas, drawn with integer arithmetic only, so the
TypeScript twin (`app/src/features/photo-scoring/synthetic-canvas.ts`) can
reproduce it pixel for pixel. No real photo is involved anywhere (hard rule 7).

A small face: a black disc, ring lines, bar "digits" at four positions on each
ring, torn holes, flat repair patches, per-pixel paper grain, and a band of
white warp padding around the edge. Every shape is a squared-distance or
rectangle test on integer coordinates; the grain and the torn rims come from a
32-bit hash of (x, y, seed). Keep both implementations in lock-step.
"""
from __future__ import annotations

import math

import numpy as np

MASK = 0xFFFFFFFF


def hash32(x: int, y: int, seed: int) -> int:
    h = ((x * 73856093) & MASK) ^ ((y * 19349663) & MASK) ^ (seed & MASK)
    h ^= h >> 13
    h = (h * 0x5BD1E995) & MASK
    h ^= h >> 15
    return h


def synthetic_canvas(seed: int, size: int, holes, patches, black_r: int, rings, pad: int) -> np.ndarray:
    """`holes`, `patches`: lists of (x, y) centres in px. `black_r` and `rings`
    in px. `pad`: L1 radius of the diamond outside which the canvas is white
    warp padding. Returns uint8 size x size."""
    c = size // 2
    out = np.zeros((size, size), np.uint8)
    for y in range(size):
        for x in range(size):
            dx, dy = x - c, y - c
            r2 = dx * dx + dy * dy
            in_black = r2 <= black_r * black_r
            v = 40 if in_black else 225
            # ring lines: a 1 px band (|r - rr| <= 0.5), fainter than a hole
            for rr in rings:
                if (2 * rr - 1) * (2 * rr - 1) <= 4 * r2 <= (2 * rr + 1) * (2 * rr + 1):
                    v = 140 if in_black else 120
            # bar "digits": diagonal bars ~17 px long, 6 px inside each ring, at
            # four positions. Diagonal, like the patches and the padding edge
            # below, because an edge that is exactly vertical leaves float32
            # rounding residues in OpenCV's Sobel that pick orientation bins
            # arbitrarily — real photos have no exact edges, this art must not.
            for rr in rings:
                for (bx, by) in ((c + rr - 8, c), (c - rr + 8, c), (c, c + rr - 8), (c, c - rr + 8)):
                    u, w = (x - bx) + (y - by), (x - bx) - (y - by)
                    if abs(u) <= 2 and abs(w) <= 12:
                        v = 220 if in_black else 50
            # patches: flat diamonds, 14 px from centre to tip
            for (px, py) in patches:
                if abs(x - px) + abs(y - py) <= 14:
                    v = 55 if in_black else 215
            # holes: a core, a rim, and a jagged fringe decided by the hash
            for (hx, hy) in holes:
                ex, ey = x - hx, y - hy
                e2 = ex * ex + ey * ey
                if e2 <= 81:
                    v = 190 if in_black else 90
                elif e2 <= 144:
                    v = 215 if in_black else 60
                elif e2 <= 225 and hash32(x, y, seed + 7) % 3 == 0:
                    v = 215 if in_black else 60
            # grain: -3..+3
            v += (hash32(x, y, seed) % 7) - 3
            # padding: everything outside a diamond of L1 radius `pad`, so the
            # padding edge is diagonal and its corners touch the border
            if abs(dx) + abs(dy) > pad:
                v = 255
            out[y, x] = min(255, max(0, v))
    return out


def synthetic_closeup(seed: int, width: int, height: int, H, holes) -> np.ndarray:
    """A photo-like close-up of the precision face's ring lines, for the
    close-up lock's fixture (TS twin: `syntheticCloseup`).

    `H` is nine integers mapping a quarter-pixel sample (4x+1 or 4x+3) to
    target units of 1/8 mm: (U/W, V/W) with U = H0 qx + H1 qy + H2, and so on.
    Each pixel is the floor mean of its 2x2 samples plus the grain. Lines at
    every 25 mm and the X at 12.5 mm, the black disc to 100 mm, and `holes`
    as (x, y) target units. Every product stays below 2^53 so a JS double
    holds it exactly."""
    qx = (4 * np.arange(width, dtype=np.int64))[None, :]
    qy = (4 * np.arange(height, dtype=np.int64))[:, None]
    total = np.zeros((height, width), np.int64)
    for ox, oy in ((1, 1), (3, 1), (1, 3), (3, 3)):
        X, Y = qx + ox, qy + oy
        U = H[0] * X + H[1] * Y + H[2]
        V = H[3] * X + H[4] * Y + H[5]
        W = H[6] * X + H[7] * Y + H[8]
        r2 = U * U + V * V
        w2 = W * W
        black = r2 <= (CLOSEUP_BLACK_R * CLOSEUP_BLACK_R) * w2
        v = np.where(black, 40, 225)
        for rr in CLOSEUP_RINGS:
            lo, hi = rr - CLOSEUP_LINE_HALF, rr + CLOSEUP_LINE_HALF
            on = (lo * lo * w2 <= r2) & (r2 <= hi * hi * w2)
            v = np.where(on, np.where(black, 200, 60), v)
        for hx, hy in holes:
            ex, ey = U - hx * W, V - hy * W
            inside = ex * ex + ey * ey <= (CLOSEUP_HOLE_R * CLOSEUP_HOLE_R) * w2
            v = np.where(inside, np.where(black, 180, 70), v)
        total += v
    out = total // 4
    grain = np.array([[hash32(x, y, seed) % 7 - 3 for x in range(width)] for y in range(height)])
    return np.clip(out + grain, 0, 255).astype(np.uint8)


def closeup_homography(width: int, height: int, px_per_mm: float, cx: float, cy: float,
                       rot_deg: float = 0.0, aniso: float = 1.0, g: int = 0, h: int = 0,
                       w0: int = 16384) -> list[int]:
    """Integer `H` for `synthetic_closeup`: the target centre at image px
    (cx, cy), `px_per_mm` along x before `aniso` stretches y, rotated, and a
    perspective term (g, h) in the denominator."""
    k = 8.0 / (4.0 * px_per_mm)          # target units per quarter px
    t = math.radians(rot_deg)
    a, b = k * math.cos(t), k * math.sin(t)
    m = [[a, b], [-b / aniso, a / aniso]]
    qcx, qcy = 4 * cx, 4 * cy
    rows = []
    for r in m:
        c0, c1 = round(w0 * r[0]), round(w0 * r[1])
        rows += [c0, c1, -round(c0 * qcx + c1 * qcy)]
    return rows + [g, h, w0]


CLOSEUP_BLACK_R = 800          # 100 mm in 1/8 mm
CLOSEUP_RINGS = (100,) + tuple(200 * k for k in range(1, 9))   # X, then 25..200 mm
CLOSEUP_LINE_HALF = 3          # a 0.75 mm line
CLOSEUP_HOLE_R = 22            # 5.6 mm calibre
CLOSEUP_WORK_LONG_SIDE = 768   # the fixture's 1024 px images resize by 0.75, as a 2048 px photo does
CLOSEUP_SCENARIOS = [
    # the 9-10 view, square on
    dict(name="centred", seed=11, width=1024, height=768,
         H=closeup_homography(1024, 768, 7.0, 530.0, 370.0), holes=[(60, -40), (-150, 90)]),
    # the 8-10 view, rotated and stretched as a tilted phone sees it
    dict(name="affine", seed=12, width=1024, height=768,
         H=closeup_homography(1024, 768, 5.0, 500.0, 400.0, rot_deg=20.0, aniso=0.95),
         holes=[(230, 10), (-40, -260), (300, 300)]),
    # the 7-10 view in perspective
    dict(name="perspective", seed=13, width=1024, height=768,
         H=closeup_homography(1024, 768, 3.6, 480.0, 390.0, rot_deg=-8.0, aniso=0.97, g=1, w0=49152),
         holes=[(0, 150), (420, -380), (-500, 120)]),
    # off-centre, holes through the 10 and the X
    dict(name="off-centre", seed=14, width=1024, height=768,
         H=closeup_homography(1024, 768, 6.0, 330.0, 260.0, rot_deg=5.0),
         holes=[(20, 0), (-30, 60), (180, -20), (90, 180)]),
    # the centre out of frame: only the outer rings, which no lock may accept
    dict(name="outer", seed=15, width=1024, height=768,
         H=closeup_homography(1024, 768, 4.0, -420.0, 380.0), holes=[(1100, 40)]),
]


SCENARIOS = [
    # seed, size, holes, patches
    dict(seed=1, size=520, holes=[(230, 250), (300, 300), (250, 320), (400, 260)],
         patches=[(280, 220), (330, 340)]),
    dict(seed=2, size=520, holes=[(262, 262), (200, 200), (350, 180)],
         patches=[(180, 300), (320, 400), (420, 420)]),
    # a touching pair, and a hole at 45 degrees near the padding edge
    dict(seed=3, size=520, holes=[(260, 262), (275, 262), (100, 420)], patches=[(260, 140)]),
]
BLACK_R = 160          # 40 mm at 4 px/mm
RINGS = (40, 80, 120, 160, 200, 240)   # 10..60 mm
PAD = 360
