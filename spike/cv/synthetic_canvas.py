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
