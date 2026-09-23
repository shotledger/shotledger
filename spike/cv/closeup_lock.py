"""Lock onto a close-up of the 25 m precision face without its black edge.

The disc lock in target_cv.py anchors on the black zone's outer edge (the 7
ring). A close-up of the 8-10 rings has no such edge, but it still has the
ring lines, and on this face every line from the 10 outward sits at a whole
multiple of 25 mm from the centre (X at 12.5 mm is the only exception). So:

1. centre: gradient normals of concentric lines all pass through it, so a
   vote along each strong edge's normal peaks there;
2. scale: the radial ridge profile from that centre is periodic, and its
   period is 25 mm -- no ring has to be identified by its number;
3. shape: points on each line, divided by its multiple, all lie on one
   ellipse, whose fit gives the affine (tilt) and refines the centre.

Returns an image -> mm homography, or None when the evidence is too thin.

This is the reference for `app/src/features/photo-scoring/closeup-lock.ts`,
pinned to it by `closeup-lock.fixtures.json` (gen_closeup_lock_fixtures.py).
Everything outside the four image operations (`resize_area`, `blur`, `sobel`,
`polar`) is written so it ports line for line: float64 throughout, no random
sampling, a hand-written ellipse fit and least squares.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

RING_STEP_MM = 25.0
WORK_LONG_SIDE = 1536
# The centre vote runs at 512 px, a ninth of the work at 1536, then again at
# full resolution only within VOTE_WINDOW px of that peak.
VOTE_LONG_SIDE = 512
VOTE_WINDOW = 24
VOTE_MAX_EDGES = 30000
NANG = 720

# Gate (docs/specs/cv-closeup-lock-2026-09.md).
GATE_RESIDUAL_MM = 0.5
GATE_COMB = 8.0
GATE_RING_OFFSET_MM = 0.5


@dataclass
class CloseupLock:
    to_mm: np.ndarray          # 3x3, original image px -> mm, centre at 0,0
    center: tuple[float, float]  # original px
    px_per_step: float         # mean ellipse radius of one 25 mm step, work px
    rings: int                 # ring lines that took part in the fit
    support: float             # share of in-frame rays that found each ring line
    residual_mm: float         # median |radial residual| of the fit points
    comb: float                # periodicity score of the profile
    axis_ratio: float
    ring_offset_mm: float | None  # worst ring's distance from its printed line
    vote_center: tuple[float, float]  # work px
    period: float              # work px


def passes_gate(lock: CloseupLock | None) -> bool:
    return bool(lock is not None and lock.residual_mm <= GATE_RESIDUAL_MM and lock.comb >= GATE_COMB
                and lock.ring_offset_mm is not None and lock.ring_offset_mm <= GATE_RING_OFFSET_MM)


# ------------------------------------------------------------ image operations
# The only calls into OpenCV. The TS port has a pure version of each and hands
# them to OpenCV on a device.

def resize_area(g: np.ndarray, w: int, h: int) -> np.ndarray:
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_AREA)


def blur(g: np.ndarray, sx: float, sy: float | None = None) -> np.ndarray:
    return cv2.GaussianBlur(g, (0, 0), sigmaX=sx, sigmaY=sx if sy is None else sy)


def sobel(g: np.ndarray):
    return cv2.Sobel(g, cv2.CV_64F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_64F, 0, 1, ksize=3)


def bilinear(g: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Bilinear samples; a neighbour outside the image counts as 0."""
    h, w = g.shape
    x0 = np.floor(xs).astype(np.int64)
    y0 = np.floor(ys).astype(np.int64)
    fx, fy = xs - x0, ys - y0
    out = np.zeros(xs.shape, np.float64)
    for dy, wy in ((0, 1 - fy), (1, fy)):
        for dx, wx in ((0, 1 - fx), (1, fx)):
            xx, yy = x0 + dx, y0 + dy
            ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
            v = np.zeros(xs.shape, np.float64)
            v[ok] = g[yy[ok], xx[ok]]
            out += wx * wy * v
    return out


def polar(g: np.ndarray, cx: float, cy: float, nang: int, rmax: int) -> np.ndarray:
    """nang x rmax samples at (cx + r cos a, cy + r sin a), a = 2 pi i / nang --
    cv2.warpPolar's grid, so a device can use it."""
    ang = np.arange(nang) * (2 * np.pi / nang)
    rs = np.arange(rmax, dtype=np.float64)
    return bilinear(g, cx + np.outer(np.cos(ang), rs), cy + np.outer(np.sin(ang), rs))


# ------------------------------------------------------------ helpers

def work_image(g0: np.ndarray, long_side: int = WORK_LONG_SIDE):
    """Float64 work image, and the 3x3 taking original px to work px."""
    h0, w0 = g0.shape
    s = min(1.0, long_side / max(h0, w0))
    w, h = int(w0 * s + 0.5), int(h0 * s + 0.5)
    g = g0.astype(np.float64)
    if (w, h) != (w0, h0):
        g = resize_area(g, w, h)
    sx, sy = w / w0, h / h0
    # pixel centres: work px i covers original [i/sx, (i+1)/sx)
    S = np.array([[sx, 0, 0.5 * sx - 0.5], [0, sy, 0.5 * sy - 0.5], [0, 0, 1.0]])
    return blur(g, 1.0), S


def _quantile(a: np.ndarray, q: float) -> float:
    s = np.sort(a.ravel())
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    return float(s[lo] + (s[hi] - s[lo]) * (pos - lo))


def _vote_center(g: np.ndarray) -> tuple[float, float]:
    H, W = g.shape
    f = min(1.0, VOTE_LONG_SIDE / max(H, W))
    w, h = int(W * f + 0.5), int(H * f + 0.5)
    gv = resize_area(g, w, h) if (w, h) != (W, H) else g
    xs, ys, ux, uy = _edges(gv)
    # A hole votes for its own centre only at a few px; skip short distances.
    L = max(h, w)
    d0, d1 = 0.04 * L, 1.2 * L
    ds = d0 + np.arange(int(math.ceil(d1 - d0)), dtype=np.float64)
    acc = np.zeros(h * w, np.float64)
    for sgn in (1.0, -1.0):
        vx = np.floor(xs[:, None] + sgn * ux[:, None] * ds[None, :] + 0.5).ravel()
        vy = np.floor(ys[:, None] + sgn * uy[:, None] * ds[None, :] + 0.5).ravel()
        ok = (vx >= 0) & (vx < w) & (vy >= 0) & (vy < h)
        idx = vy[ok].astype(np.int64) * w + vx[ok].astype(np.int64)
        acc += np.bincount(idx, minlength=h * w)
    acc = blur(acc.reshape(h, w), 1.0)
    k = int(np.argmax(acc))
    my, mx = divmod(k, w)
    return _refine_vote(g, (mx + 0.5) * (W / w) - 0.5, (my + 0.5) * (H / h) - 0.5)


def _edges(g: np.ndarray):
    """Strongest 5% of the gradient, every n-th if too many, and unit normals."""
    gx, gy = sobel(g)
    mag = np.hypot(gx, gy)
    thr = _quantile(mag, 0.95)
    ys, xs = np.nonzero(mag > thr)
    if len(xs) > VOTE_MAX_EDGES:
        pick = (np.arange(VOTE_MAX_EDGES) * len(xs)) // VOTE_MAX_EDGES
        xs, ys = xs[pick], ys[pick]
    return xs, ys, gx[ys, xs] / mag[ys, xs], gy[ys, xs] / mag[ys, xs]


def _refine_vote(g: np.ndarray, cx: float, cy: float) -> tuple[float, float]:
    """The vote again at full resolution, counted only in a window around the
    coarse peak: each normal votes only along the stretch that crosses it."""
    H, W = g.shape
    xs, ys, ux, uy = _edges(g)
    L = max(H, W)
    d0, step = 0.04 * L, 1.5
    n = int(math.ceil((1.2 * L - d0) / step))
    R = VOTE_WINDOW
    ox, oy = int(math.floor(cx + 0.5)) - R, int(math.floor(cy + 0.5)) - R
    reach = step * R
    side = 2 * R + 1
    acc = np.zeros(side * side, np.float64)
    near = np.abs(ux * (cy - ys) - uy * (cx - xs)) <= reach
    xs, ys, ux, uy = xs[near], ys[near], ux[near], uy[near]
    j = np.arange(2 * R + 2)
    for sgn in (1.0, -1.0):
        t = sgn * (ux * (cx - xs) + uy * (cy - ys))
        i0 = np.ceil((t - reach - d0) / step)
        i = i0[:, None] + j[None, :]
        ok = (i >= 0) & (i < n) & (i <= np.floor((t + reach - d0) / step)[:, None])
        d = d0 + step * i
        vx = np.floor(xs[:, None] + sgn * ux[:, None] * d + 0.5) - ox
        vy = np.floor(ys[:, None] + sgn * uy[:, None] * d + 0.5) - oy
        ok &= (vx >= 0) & (vx < side) & (vy >= 0) & (vy < side)
        acc += np.bincount((vy[ok] * side + vx[ok]).astype(np.int64), minlength=side * side)
    acc = blur(acc.reshape(side, side), 3.0)
    k = int(np.argmax(acc))
    my, mx = divmod(k, side)
    return float(ox + mx), float(oy + my)


def _polar_ridge(g: np.ndarray, cx: float, cy: float):
    """Polar resample, then a thin-line response along the radius (abs, both
    polarities). The low-pass is normalised over in-frame samples only, and
    samples outside the frame are NaN."""
    h, w = g.shape
    rmax = int(math.hypot(max(cx, w - cx), max(cy, h - cy)))
    ang = np.arange(NANG) * (2 * np.pi / NANG)
    rs = np.arange(rmax, dtype=np.float64)
    xs = cx + np.outer(np.cos(ang), rs)
    ys = cy + np.outer(np.sin(ang), rs)
    inside = (xs >= 0) & (xs <= w - 1) & (ys >= 0) & (ys <= h - 1)
    m = inside.astype(np.float64)
    pol = polar(g, cx, cy, NANG, rmax) * m
    num = blur(pol, 6.0, 0.01)
    den = blur(m, 6.0, 0.01)
    lp = num / np.maximum(den, 1e-9)
    ridge = np.abs(pol - lp)
    ridge[~inside] = np.nan
    return ridge, ang


def _profile(ridge: np.ndarray) -> np.ndarray:
    ok = ~np.isnan(ridge)
    cover = ok.mean(axis=0)
    n = ok.sum(axis=0)
    prof = np.where(ok, ridge, 0.0).sum(axis=0) / np.maximum(n, 1)
    prof[(cover < 0.25) | (n == 0)] = np.nan
    return prof


def _median(a) -> float:
    return float(np.median(a))


def _best_period(prof: np.ndarray) -> tuple[float, float, int]:
    """Period (px) of the ring lines. Scored as line strength at the multiples
    minus strength half-way between them, so neither twice the period (whose
    half-way points are real lines) nor half of it (whose multiples include
    empty radii) can win."""
    valid = np.nonzero(~np.isnan(prof))[0]
    if len(valid) < 40:
        return 0.0, 0.0, 0
    rlim = int(valid.max())
    vals = prof[valid]
    base = _median(vals)
    mad = _median(np.abs(vals - base)) + 1e-6
    z = np.nan_to_num((prof - base) / mad, nan=0.0)

    def peak(r, P):
        half = max(2.0, 0.04 * P)
        return z[int(r - half):int(r + half) + 1].max()

    def comb(P, skip=0):
        """Mean line strength at the multiples of P minus half-way between;
        with `skip`, only the multiples that are not multiples of `skip`."""
        on, off = 0.0, 0.0
        n = 0
        k = 1
        while (k + 0.5) * P + 3 < rlim:
            if not np.isnan(prof[int(k * P)]) and not (skip and k % skip == 0):
                on += peak(k * P, P)
                off += peak((k + 0.5) * P, P)
                n += 1
            k += 1
        return ((on - off) / n if n else -1e9), n

    best = (0.0, -1e9, 0)
    i = 0
    while 12.0 + 0.25 * i < rlim / 3.0:
        P = 12.0 + 0.25 * i
        sc, n = comb(P)
        # Two lines are enough: the 10 and 9 at 25 and 50 mm are all a tight
        # close-up shows, and their 1:2 ratio already fixes the period.
        if n >= 2 and sc > best[1]:
            best = (P, sc, n)
        i += 1
    if best[1] <= 0:
        return 0.0, 0.0, 0
    # Every third line (8, 5, 2) is a clean comb too. A shorter period wins
    # when the lines only it predicts are really there -- which the X ring,
    # alone at half a step, never is.
    for div in (2, 3):
        sub = best[0] / div
        if sub < 12.0:
            continue
        extra, n = comb(sub, skip=div)
        if n >= 2 and extra >= 0.5 * best[1]:
            full, nf = comb(sub)
            return (sub, full, nf)
    return best


def _solve(A: np.ndarray, b: np.ndarray) -> np.ndarray | None:
    """Gaussian elimination with partial pivoting, as the port does it."""
    n = len(b)
    M = np.hstack([A.astype(np.float64), b.reshape(-1, 1).astype(np.float64)])
    for c in range(n):
        p = c + int(np.argmax(np.abs(M[c:, c])))
        if abs(M[p, c]) < 1e-300:
            return None
        if p != c:
            M[[c, p]] = M[[p, c]]
        for r in range(n):
            if r != c:
                M[r, c:] -= (M[r, c] / M[c, c]) * M[c, c:]
    return M[:, n] / np.diag(M[:, :n])


def _residuals(x: np.ndarray, pts: np.ndarray, target: np.ndarray, skew0: float):
    """Radial residuals of every ring point and the rotation prior, with the
    Jacobian (N+1 x 8)."""
    X, Y = pts[:, 0], pts[:, 1]
    w = x[6] * X + x[7] * Y + 1.0
    u = (x[0] * X + x[1] * Y + x[2]) / w
    v = (x[3] * X + x[4] * Y + x[5]) / w
    rho = np.maximum(np.hypot(u, v), 1e-12)
    r = np.append(rho - target, PRIOR_WEIGHT * (x[1] - x[3] - skew0))
    du, dv = u / rho / w, v / rho / w
    J = np.zeros((len(pts) + 1, 8))
    J[:-1, 0], J[:-1, 1], J[:-1, 2] = du * X, du * Y, du
    J[:-1, 3], J[:-1, 4], J[:-1, 5] = dv * X, dv * Y, dv
    J[:-1, 6] = -(du * u + dv * v) * X
    J[:-1, 7] = -(du * u + dv * v) * Y
    J[-1, 1], J[-1, 3] = PRIOR_WEIGHT, -PRIOR_WEIGHT
    return r, J


PRIOR_WEIGHT = 10.0
F_SCALE_MM = 0.5
LM_ITERS = 100


def _soft_l1(r: np.ndarray) -> float:
    z = (r / F_SCALE_MM) ** 2
    return float(np.sum(2.0 * F_SCALE_MM ** 2 * (np.sqrt(1.0 + z) - 1.0)))


def _refine_homography(H0: np.ndarray, pts: np.ndarray, ks: np.ndarray):
    """Robust least squares on the ring points: each should land k*25 mm from
    the origin. Perspective makes the rings non-concentric ellipses, which the
    affine cannot follow. A rotation about the centre leaves every radius
    unchanged, so a weak prior holds that one direction in place.

    Levenberg-Marquardt on iteratively reweighted residuals, soft-L1 loss at
    F_SCALE_MM -- scipy's least_squares(loss="soft_l1") written out so the
    port can mirror it."""
    H0 = H0 / H0[2, 2]
    x = H0.ravel()[:8].astype(np.float64)
    target = ks * RING_STEP_MM
    skew0 = H0[0, 1] - H0[1, 0]
    r, J = _residuals(x, pts, target, skew0)
    cost = _soft_l1(r)
    lam = 1e-3
    for _ in range(LM_ITERS):
        wt = 1.0 / np.sqrt(1.0 + (r / F_SCALE_MM) ** 2)
        A = J.T @ (J * wt[:, None])
        g = J.T @ (wt * r)
        improved = done = False
        while lam <= 1e10:
            step = _solve(A + lam * np.diag(np.diag(A)), -g)
            if step is None:
                lam *= 10.0
                continue
            xn = x + step
            rn, Jn = _residuals(xn, pts, target, skew0)
            cn = _soft_l1(rn)
            if cn < cost:
                done = cost - cn <= 1e-12 * cost
                x, r, J, cost = xn, rn, Jn, cn
                lam = max(lam / 10.0, 1e-12)
                improved = True
                break
            lam *= 10.0
        if not improved or done:
            break
    H = np.append(x, 1.0).reshape(3, 3)
    return H, float(np.median(np.abs(r[:-1])))


def _fit_ellipse(pts: np.ndarray):
    """Direct least-squares ellipse (Fitzgibbon, in Halir and Flusser's stable
    form) on normalised points. Returns (cx, cy, Q) with (p - c)^T Q (p - c) = 1,
    or None when the best conic is not an ellipse."""
    m = pts.mean(axis=0)
    s = math.sqrt(float(np.mean(np.sum((pts - m) ** 2, axis=1))) / 2.0)
    if not s > 0:
        return None
    x = (pts[:, 0] - m[0]) / s
    y = (pts[:, 1] - m[1]) / s
    D1 = np.stack([x * x, x * y, y * y], 1)
    D2 = np.stack([x, y, np.ones_like(x)], 1)
    S1, S2, S3 = D1.T @ D1, D1.T @ D2, D2.T @ D2
    T = np.zeros((3, 3))
    for c in range(3):
        col = _solve(S3, -S2.T[:, c])
        if col is None:
            return None
        T[:, c] = col
    M = S1 + S2 @ T
    M = np.array([M[2] / 2.0, -M[1], M[0] / 2.0])
    best, a1 = 0.0, None
    for vec in _real_eigenvectors(M):
        cond = 4 * vec[0] * vec[2] - vec[1] ** 2
        if cond > best:
            best, a1 = cond, vec
    if a1 is None:
        return None
    A, B, C = a1
    D, E, F = T @ a1
    det = 4 * A * C - B * B
    xc = (B * E - 2 * C * D) / det
    yc = (B * D - 2 * A * E) / det
    Fc = A * xc * xc + B * xc * yc + C * yc * yc + D * xc + E * yc + F
    if Fc == 0:
        return None
    Q = np.array([[A, B / 2], [B / 2, C]]) / (-Fc) / (s * s)
    if not (Q[0, 0] > 0 and Q[0, 0] * Q[1, 1] - Q[0, 1] ** 2 > 0):
        return None
    return m[0] + s * xc, m[1] + s * yc, Q


def _real_eigenvectors(M: np.ndarray):
    """Unit eigenvectors of the real eigenvalues of a 3x3, from the roots of
    its characteristic cubic and a cross product of two rows of M - l I."""
    tr = M[0, 0] + M[1, 1] + M[2, 2]
    c1 = (M[0, 0] * M[1, 1] - M[0, 1] * M[1, 0] + M[0, 0] * M[2, 2] - M[0, 2] * M[2, 0]
          + M[1, 1] * M[2, 2] - M[1, 2] * M[2, 1])
    det = (M[0, 0] * (M[1, 1] * M[2, 2] - M[1, 2] * M[2, 1])
        - M[0, 1] * (M[1, 0] * M[2, 2] - M[1, 2] * M[2, 0])
        + M[0, 2] * (M[1, 0] * M[2, 1] - M[1, 1] * M[2, 0]))
    out = []
    for lam in _cubic_roots(-tr, c1, -det):
        N = M - lam * np.eye(3)
        best, vec = 0.0, None
        for i, j in ((0, 1), (0, 2), (1, 2)):
            v = np.cross(N[i], N[j])
            n = float(np.sqrt(np.sum(v * v)))
            if n > best:
                best, vec = n, v / n
        if vec is not None:
            out.append(vec)
    return out


def _cubic_roots(a: float, b: float, c: float) -> list[float]:
    """Real roots of x^3 + a x^2 + b x + c, each polished by Newton."""
    q = (a * a - 3 * b) / 9
    r = (2 * a ** 3 - 9 * a * b + 27 * c) / 54
    if r * r < q ** 3:
        t = math.acos(max(-1.0, min(1.0, r / math.sqrt(q ** 3))))
        sq = -2 * math.sqrt(q)
        roots = [sq * math.cos(t / 3) - a / 3,
                 sq * math.cos((t + 2 * math.pi) / 3) - a / 3,
                 sq * math.cos((t - 2 * math.pi) / 3) - a / 3]
    else:
        A = -math.copysign(1.0, r) * (abs(r) + math.sqrt(r * r - q ** 3)) ** (1 / 3)
        B = q / A if A != 0 else 0.0
        roots = [A + B - a / 3]
    out = []
    for x in roots:
        for _ in range(3):
            f = ((x + a) * x + b) * x + c
            d = (3 * x + 2 * a) * x + b
            if d == 0:
                break
            x -= f / d
        out.append(x)
    return out


def _unit_map(cx: float, cy: float, Q: np.ndarray):
    """Affine taking the ellipse to the unit circle at the origin without
    rotating the picture (the symmetric square root of Q), so image 'up' stays
    'up'. Also the ellipse's two full axes."""
    a, b, c = Q[0, 0], Q[0, 1], Q[1, 1]
    sd = math.sqrt(a * c - b * b)
    t = math.sqrt(a + c + 2 * sd)
    A = np.array([[a + sd, b], [b, c + sd]]) / t
    M = np.eye(3)
    M[:2, :2] = A
    M[:2, 2] = -A @ np.array([cx, cy])
    mean = (a + c) / 2
    dev = math.sqrt(((a - c) / 2) ** 2 + b * b)
    d1, d2 = 2 / math.sqrt(mean + dev), 2 / math.sqrt(mean - dev)
    return M, d1, d2


# ------------------------------------------------------------ the lock

def lock_closeup(img: np.ndarray, projective: bool = True,
                 work_long_side: int = WORK_LONG_SIDE) -> CloseupLock | None:
    g0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    g, S = work_image(g0, work_long_side)
    return lock_work(g, S, projective)


def lock_work(g: np.ndarray, S: np.ndarray, projective: bool = True) -> CloseupLock | None:
    cx0, cy0 = _vote_center(g)
    ridge, ang = _polar_ridge(g, cx0, cy0)
    P, comb, _ = _best_period(_profile(ridge))
    if P <= 0:
        return None
    lines = circle_ridge(g)
    fit = _fit(g, cx0, cy0, P, projective, (ridge, ang))
    if fit is None:
        return None
    # Holes shot through the middle can leave the X ring as the strongest
    # comb at half a step. Then every odd ring of the fit sits between two
    # printed lines, which the fit itself shows.
    offset = ring_offsets(lines, fit[0])
    if _is_half_period(lines, fit[0]) or offset is None or offset > GATE_RING_OFFSET_MM:
        refit = _fit(g, cx0, cy0, 2 * P, projective, (ridge, ang))
        if refit is not None:
            re_offset = ring_offsets(lines, refit[0])
            if re_offset is not None and (offset is None or re_offset < offset):
                fit, offset = refit, re_offset
    work_to_mm, ecx, ecy, d1, d2, used, support, residual = fit
    to_mm = work_to_mm @ S
    c = np.linalg.inv(to_mm) @ np.array([0.0, 0.0, 1.0])
    return CloseupLock(
        to_mm=to_mm,
        center=(float(c[0] / c[2]), float(c[1] / c[2])),
        px_per_step=(d1 + d2) / 4.0,
        rings=used,
        support=support,
        residual_mm=residual,
        comb=comb,
        axis_ratio=max(d1, d2) / max(1e-6, min(d1, d2)),
        ring_offset_mm=offset,
        vote_center=(cx0, cy0),
        period=P,
    )


def circle_ridge(g: np.ndarray) -> np.ndarray:
    """Thin-line response the ring-offset yardstick reads."""
    return np.abs(g - blur(g, 4.0))


def _circle_mean(ridge, inv, R, ang):
    """Mean line response along the mm circle of radius R, in frame only."""
    X, Y = R * np.cos(ang), R * np.sin(ang)
    w_ = inv[2, 0] * X + inv[2, 1] * Y + inv[2, 2]
    px = (inv[0, 0] * X + inv[0, 1] * Y + inv[0, 2]) / w_
    py = (inv[1, 0] * X + inv[1, 1] * Y + inv[1, 2]) / w_
    h, w = ridge.shape
    ok = (px >= 0) & (px < w - 1) & (py >= 0) & (py < h - 1)
    if ok.mean() < 0.3:
        return None
    return float(bilinear(ridge, px[ok], py[ok]).mean())


def _circle_angles() -> np.ndarray:
    return np.arange(360) * (2 * np.pi / 360)


def _is_half_period(lines: np.ndarray, work_to_mm: np.ndarray) -> bool:
    inv = np.linalg.inv(work_to_mm)
    ang = _circle_angles()
    odd, even = [], []
    for k in range(1, 12):
        on = _circle_mean(lines, inv, k * RING_STEP_MM, ang)
        mid = _circle_mean(lines, inv, (k + 0.5) * RING_STEP_MM, ang)
        if on is None or mid is None:
            continue
        (odd if k % 2 else even).append(on / max(mid, 1e-6))
    # k=1 is the X ring when the period is halved, so it proves nothing.
    odd = odd[1:]
    return bool(odd and even and np.mean(odd) < 1.3 and np.mean(even) > 1.8)


def ring_offsets(lines: np.ndarray, to_mm: np.ndarray, radii=(25.0, 50.0, 75.0),
                 win: float = 3.0, step: float = 0.1) -> float | None:
    """Per ring, the radial offset (mm) at which the line response along the
    lock's circle peaks; the max |offset| over rings mostly in frame. Both
    the gate and the choice between two locks hold a lock to this. `lines` is
    `circle_ridge` of the image `to_mm` maps from."""
    inv = np.linalg.inv(to_mm)
    ang = _circle_angles()
    n_off = int(round(2 * win / step))
    worst, n = 0.0, 0
    for R in radii:
        if _circle_mean(lines, inv, R, ang) is None:
            continue
        best, bo = -math.inf, 0.0
        for i in range(n_off + 1):
            o = -win + i * step
            v = _circle_mean(lines, inv, R + o, ang)
            v = -1.0 if v is None else v
            if v > best:
                best, bo = v, o
        worst = max(worst, abs(bo))
        n += 1
    return worst if n else None


def _ring_points(ridge: np.ndarray, ang: np.ndarray, cx: float, cy: float, P: float):
    """Per ray, the ridge maximum near each k*P, where it stands out."""
    xs, ys, ks = [], [], []
    seen = found = 0
    nr = ridge.shape[1]
    kmax = int(nr / P)
    for k in range(1, kmax + 1):
        lo, hi = int(k * P - 0.25 * P), int(k * P + 0.25 * P) + 1
        if hi >= nr:
            break
        band = ridge[:, lo:hi]
        okrow = ~np.isnan(band).any(axis=1)
        if okrow.mean() < 0.15:
            continue
        b = np.where(np.isnan(band), -1.0, band)
        j = np.argmax(b, axis=1)
        rows = np.arange(len(j))
        peak = b[rows, j]
        # keep rays whose peak stands out from the band's own level
        level = np.median(b, axis=1)
        strong = okrow & (peak > 2.0 * level + 1.0)
        jj = np.clip(j, 1, b.shape[1] - 2)
        y0, y1, y2 = b[rows, jj - 1], b[rows, jj], b[rows, jj + 1]
        den = y0 - 2 * y1 + y2
        sub = np.where(np.abs(den) > 1e-6, 0.5 * (y0 - y2) / np.where(den == 0, 1, den), 0.0)
        r = (lo + jj + np.clip(sub, -0.5, 0.5))[strong]
        a = ang[strong]
        xs.append(cx + r * np.cos(a))
        ys.append(cy + r * np.sin(a))
        ks.append(np.full(len(r), float(k)))
        seen += int(okrow.sum())
        found += int(strong.sum())
    if not xs:
        return None
    return np.stack([np.concatenate(xs), np.concatenate(ys)], 1), np.concatenate(ks), seen, found


def _fit(g: np.ndarray, cx: float, cy: float, P: float, projective: bool, first):
    ridge, ang = first
    fitted = None
    for it in range(3):
        if it > 0:
            # rays radial from the refined centre
            ridge, ang = _polar_ridge(g, cx, cy)
        got = _ring_points(ridge, ang, cx, cy, P)
        if got is None:
            return None
        pts, ks, seen, found = got
        used = len({int(k) for k in ks})
        if len(pts) < 50:
            return None
        norm = np.array([cx, cy]) + (pts - np.array([cx, cy])) / ks[:, None]
        ell = _fit_ellipse(norm)
        if ell is None:
            return None
        ecx, ecy, Q = ell
        U, d1, d2 = _unit_map(ecx, ecy, Q)
        # radial residual of each original point against its own ring
        q = (U @ np.vstack([pts.T, np.ones(len(pts))]))[:2].T
        rad = np.hypot(q[:, 0], q[:, 1]) / ks
        residual = float(np.median(np.abs(rad - 1.0) * ks * RING_STEP_MM))
        fitted = (U, ecx, ecy, d1, d2, used, found / max(1, seen), residual, pts, ks)
        cx, cy = ecx, ecy
        P = (d1 + d2) / 4.0

    U, ecx, ecy, d1, d2, used, support, residual, pts, ks = fitted
    work_to_mm = np.diag([RING_STEP_MM, RING_STEP_MM, 1.0]) @ U
    if projective:
        work_to_mm, residual = _refine_homography(work_to_mm, pts, ks)
        c = np.linalg.inv(work_to_mm) @ np.array([0.0, 0.0, 1.0])
        ecx, ecy = c[0] / c[2], c[1] / c[2]
    return work_to_mm, ecx, ecy, d1, d2, used, support, residual
