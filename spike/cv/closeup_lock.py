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

Returns an image -> mm affine, or None when the evidence is too thin.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

RING_STEP_MM = 25.0
WORK_LONG_SIDE = 1536


@dataclass
class CloseupLock:
    to_mm: np.ndarray          # 3x3, original image px -> mm, centre at 0,0
    center: tuple[float, float]  # original px
    px_per_step: float         # mean ellipse radius of one 25 mm step, original px
    rings: int                 # ring lines that took part in the fit
    support: float             # share of in-frame rays that found each ring line
    residual_mm: float         # median |radial residual| of the fit points
    comb: float                # periodicity score of the profile
    axis_ratio: float
    ring_offset_mm: float | None  # worst ring's distance from its printed line


def _vote_center(g: np.ndarray) -> tuple[float, float]:
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    thr = np.quantile(mag, 0.95)
    ys, xs = np.nonzero(mag > thr)
    if len(xs) > 30000:
        pick = np.random.default_rng(0).choice(len(xs), 30000, replace=False)
        xs, ys = xs[pick], ys[pick]
    ux = gx[ys, xs] / mag[ys, xs]
    uy = gy[ys, xs] / mag[ys, xs]
    h, w = g.shape
    # A hole votes for its own centre only at a few px; skip short distances.
    ds = np.arange(0.04 * max(h, w), 1.2 * max(h, w), 1.5, dtype=np.float32)
    acc = np.zeros(h * w, np.float32)
    for sgn in (1.0, -1.0):
        vx = (xs[:, None] + sgn * ux[:, None] * ds[None, :]).ravel()
        vy = (ys[:, None] + sgn * uy[:, None] * ds[None, :]).ravel()
        ok = (vx >= 0) & (vx < w) & (vy >= 0) & (vy < h)
        idx = vy[ok].astype(np.int64) * w + vx[ok].astype(np.int64)
        acc += np.bincount(idx, minlength=h * w).astype(np.float32)
    acc = cv2.GaussianBlur(acc.reshape(h, w), (0, 0), 3)
    _, _, _, (mx, my) = cv2.minMaxLoc(acc)
    return float(mx), float(my)


def _polar_ridge(g: np.ndarray, cx: float, cy: float, nang: int = 720):
    """Polar resample, then a thin-line response along the radius (abs, both
    polarities). Samples outside the frame are NaN."""
    h, w = g.shape
    rmax = int(math.hypot(max(cx, w - cx), max(cy, h - cy)))
    ang = np.linspace(0, 2 * np.pi, nang, endpoint=False)
    rs = np.arange(rmax, dtype=np.float32)
    xs = (cx + np.outer(np.cos(ang), rs)).astype(np.float32)
    ys = (cy + np.outer(np.sin(ang), rs)).astype(np.float32)
    inside = (xs >= 0) & (xs <= w - 1) & (ys >= 0) & (ys <= h - 1)
    pol = cv2.remap(g, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    lp = cv2.GaussianBlur(pol, (0, 0), sigmaX=6, sigmaY=0.01)
    ridge = np.abs(pol - lp)
    ridge[~inside] = np.nan
    return ridge, ang


def _profile(ridge: np.ndarray) -> np.ndarray:
    cover = np.mean(~np.isnan(ridge), axis=0)
    with np.errstate(all="ignore"):
        prof = np.nanmean(ridge, axis=0)
    prof[cover < 0.25] = np.nan
    return prof


def _best_period(prof: np.ndarray) -> tuple[float, float, int]:
    """Period (px) of the ring lines. Scored as line strength at the multiples
    minus strength half-way between them, so neither twice the period (whose
    half-way points are real lines) nor half of it (whose multiples include
    empty radii) can win."""
    valid = np.nonzero(~np.isnan(prof))[0]
    if len(valid) < 40:
        return 0.0, 0.0, 0
    rlim = int(valid.max())
    base = np.nanmedian(prof)
    mad = np.nanmedian(np.abs(prof - base)) + 1e-6
    z = np.nan_to_num((prof - base) / mad, nan=0.0)

    def peak(r, P):
        half = max(2, 0.04 * P)
        return z[int(r - half):int(r + half) + 1].max()

    def comb(P, skip=0):
        """Mean line strength at the multiples of P minus half-way between;
        with `skip`, only the multiples that are not multiples of `skip`."""
        on, off = [], []
        k = 1
        while (k + 0.5) * P + 3 < rlim:
            if not np.isnan(prof[int(k * P)]) and not (skip and k % skip == 0):
                on.append(peak(k * P, P))
                off.append(peak((k + 0.5) * P, P))
            k += 1
        return (float(np.mean(on) - np.mean(off)) if on else -1e9), len(on)

    best = (0.0, -1e9, 0)
    for P in np.arange(12.0, rlim / 3.0, 0.25):
        sc, n = comb(P)
        # Two lines are enough: the 10 and 9 at 25 and 50 mm are all a tight
        # close-up shows, and their 1:2 ratio already fixes the period.
        if n >= 2 and sc > best[1]:
            best = (float(P), sc, n)
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


def _refine_homography(H0: np.ndarray, pts: np.ndarray, ks: np.ndarray):
    """Least squares on the ring points: each should land k*25 mm from the
    origin. Perspective makes the rings non-concentric ellipses, which the
    affine cannot follow. A rotation about the centre leaves every radius
    unchanged, so a weak prior holds that one direction in place."""
    from scipy.optimize import least_squares

    H0 = H0 / H0[2, 2]
    x0 = H0.ravel()[:8]
    target = ks * RING_STEP_MM
    skew0 = H0[0, 1] - H0[1, 0]

    def fun(x):
        H = np.append(x, 1.0).reshape(3, 3)
        q = H @ np.vstack([pts.T, np.ones(len(pts))])
        r = np.hypot(q[0] / q[2], q[1] / q[2]) - target
        return np.append(r, 10.0 * (H[0, 1] - H[1, 0] - skew0))

    sol = least_squares(fun, x0, loss="soft_l1", f_scale=0.5, x_scale="jac")
    H = np.append(sol.x, 1.0).reshape(3, 3)
    return H, float(np.median(np.abs(sol.fun[:-1])))


def lock_closeup(img: np.ndarray, projective: bool = True) -> CloseupLock | None:
    g0 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    s = WORK_LONG_SIDE / max(g0.shape)
    g = cv2.resize(g0, None, fx=s, fy=s, interpolation=cv2.INTER_AREA).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 1.0)

    cx0, cy0 = _vote_center(g)
    ridge, _ = _polar_ridge(g, cx0, cy0)
    P, comb, _ = _best_period(_profile(ridge))
    if P <= 0:
        return None
    fit = _fit(g, cx0, cy0, P, projective)
    if fit is None:
        return None
    # Holes shot through the middle can leave the X ring as the strongest
    # comb at half a step. Then every odd ring of the fit sits between two
    # printed lines, which the fit itself shows.
    offset = ring_offsets(g, fit[0])
    if _is_half_period(g, fit[0]) or offset is None or offset > 0.5:
        refit = _fit(g, cx0, cy0, 2 * P, projective)
        if refit is not None:
            re_offset = ring_offsets(g, refit[0])
            if re_offset is not None and (offset is None or re_offset < offset):
                fit, offset = refit, re_offset
    work_to_mm, ecx, ecy, d1, d2, used, support, residual = fit
    S = np.diag([s, s, 1.0])           # original -> work px
    return CloseupLock(
        to_mm=work_to_mm @ S,
        center=(ecx / s, ecy / s),
        px_per_step=(d1 + d2) / 4.0 / s,
        rings=used,
        support=support,
        residual_mm=residual,
        comb=comb,
        axis_ratio=max(d1, d2) / max(1e-6, min(d1, d2)),
        ring_offset_mm=offset,
    )


def _circle_ridge(g: np.ndarray):
    return np.abs(g - cv2.GaussianBlur(g, (0, 0), 4))


def _circle_mean(ridge, inv, R, ang):
    """Mean line response along the mm circle of radius R, in frame only."""
    mm = np.stack([R * np.cos(ang), R * np.sin(ang), np.ones_like(ang)])
    q = inv @ mm
    px = (q[:2] / q[2]).T.astype(np.float32)
    h, w = ridge.shape
    ok = (px[:, 0] >= 0) & (px[:, 0] < w - 1) & (px[:, 1] >= 0) & (px[:, 1] < h - 1)
    if ok.mean() < 0.3:
        return None
    return float(cv2.remap(ridge, px[ok, :1].copy(), px[ok, 1:].copy(), cv2.INTER_LINEAR).mean())


def _is_half_period(g: np.ndarray, work_to_mm: np.ndarray) -> bool:
    ridge = _circle_ridge(g)
    inv = np.linalg.inv(work_to_mm)
    ang = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    odd, even = [], []
    for k in range(1, 12):
        on = _circle_mean(ridge, inv, k * RING_STEP_MM, ang)
        mid = _circle_mean(ridge, inv, (k + 0.5) * RING_STEP_MM, ang)
        if on is None or mid is None:
            continue
        (odd if k % 2 else even).append(on / max(mid, 1e-6))
    # k=1 is the X ring when the period is halved, so it proves nothing.
    odd = odd[1:]
    return bool(odd and even and np.mean(odd) < 1.3 and np.mean(even) > 1.8)


def ring_offsets(g: np.ndarray, to_mm: np.ndarray, radii=(25.0, 50.0, 75.0),
                 win: float = 3.0, step: float = 0.1) -> float | None:
    """Per ring, the radial offset (mm) at which the line response along the
    lock's circle peaks; the max |offset| over rings mostly in frame. Both
    the gate and the evaluation hold a lock to this."""
    ridge = _circle_ridge(g.astype(np.float32))
    inv = np.linalg.inv(to_mm)
    ang = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    worst, n = 0.0, 0
    for R in radii:
        if _circle_mean(ridge, inv, R, ang) is None:
            continue
        vals = [(_circle_mean(ridge, inv, R + o, ang) or -1.0, o)
                for o in np.arange(-win, win + 1e-9, step)]
        worst = max(worst, abs(max(vals)[1]))
        n += 1
    return worst if n else None


def _fit(g: np.ndarray, cx: float, cy: float, P: float, projective: bool):
    ridge, ang = _polar_ridge(g, cx, cy)
    # Points on each line: per ray, the ridge maximum near k*P.
    ellipse = None
    residual = float("inf")
    used = 0
    for _ in range(3):
        pts, ks = [], []
        seen = found = 0
        kmax = int(ridge.shape[1] / P)
        for k in range(1, kmax + 1):
            lo, hi = int(k * P - 0.25 * P), int(k * P + 0.25 * P) + 1
            if hi >= ridge.shape[1]:
                break
            band = ridge[:, lo:hi]
            okrow = ~np.isnan(band).any(axis=1)
            if okrow.mean() < 0.15:
                continue
            b = np.where(np.isnan(band), -1, band)
            j = np.argmax(b, axis=1)
            peak = b[np.arange(len(j)), j]
            # keep rays whose peak stands out from the band's own level
            level = np.median(b[okrow], axis=1) if okrow.any() else None
            strong = okrow.copy()
            strong[okrow] = peak[okrow] > 2.0 * level + 1.0
            jj = np.clip(j, 1, b.shape[1] - 2)
            rows = np.arange(len(jj))
            y0, y1, y2 = b[rows, jj - 1], b[rows, jj], b[rows, jj + 1]
            den = y0 - 2 * y1 + y2
            sub = np.where(np.abs(den) > 1e-6, 0.5 * (y0 - y2) / den, 0.0)
            r = (lo + jj + np.clip(sub, -0.5, 0.5))[strong]
            a = ang[strong]
            pts.append(np.stack([cx + r * np.cos(a), cy + r * np.sin(a)], 1))
            ks.append(np.full(len(r), k, np.float32))
            seen += int(okrow.sum())
            found += int(strong.sum())
        if not pts:
            return None
        pts_a = np.concatenate(pts)
        ks_a = np.concatenate(ks)
        used = len({int(k) for k in ks_a})
        norm = np.array([cx, cy]) + (pts_a - np.array([cx, cy])) / ks_a[:, None]
        if len(norm) < 50:
            return None
        ellipse = cv2.fitEllipseDirect(norm.astype(np.float32))
        (ecx, ecy), (d1, d2), th = ellipse
        # radial residual of each original point against its own ring
        A = _to_unit(ellipse)
        q = (A @ np.vstack([pts_a.T, np.ones(len(pts_a))]))[:2].T
        rad = np.hypot(q[:, 0], q[:, 1]) / ks_a
        dev = np.abs(rad - 1.0) * ks_a * RING_STEP_MM
        residual = float(np.median(dev))
        # the next pass searches around the refined centre, and ridge is
        # resampled so rays are radial from it
        cx, cy = ecx, ecy
        ridge, ang = _polar_ridge(g, cx, cy)
        P = (d1 + d2) / 4.0

    (ecx, ecy), (d1, d2), _ = ellipse
    work_to_mm = np.diag([RING_STEP_MM, RING_STEP_MM, 1.0]) @ _to_unit(ellipse)
    if projective:
        work_to_mm, residual = _refine_homography(work_to_mm, pts_a, ks_a)
        c = np.linalg.inv(work_to_mm) @ np.array([0.0, 0.0, 1.0])
        ecx, ecy = c[0] / c[2], c[1] / c[2]
    return work_to_mm, ecx, ecy, d1, d2, used, found / max(1, seen), residual


def _to_unit(ellipse) -> np.ndarray:
    """Affine taking the ellipse to the unit circle at the origin, without
    rotating the picture: R^T S R, so image 'up' stays 'up'."""
    (cx, cy), (d1, d2), th = ellipse
    t = math.radians(th)
    R = np.array([[math.cos(t), math.sin(t)], [-math.sin(t), math.cos(t)]])
    Sd = np.diag([2.0 / d1, 2.0 / d2])
    A = R.T @ Sd @ R
    M = np.eye(3)
    M[:2, :2] = A
    M[:2, 2] = -A @ np.array([cx, cy])
    return M
