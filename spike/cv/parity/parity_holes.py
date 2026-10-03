"""The Python hole proposals on the same rectified canvases as holes.parity.ts,
the diff, and a measurement of the TypeScript against hand marks.

    python parity_holes.py prep  <out-dir> <photo>... [--lock closeup]  # canvases + sidecars
    python parity_holes.py run   <canvas-dir> <out.jsonl>               # the reference on each
    python parity_holes.py diff  <python.jsonl> <ts.jsonl>              # where the two disagree
    python parity_holes.py score <ts.jsonl> <marks.txt> [--csv c.csv]   # TS vs hand marks

`prep` rectifies each photo as `eval_hole_proposals.py` does (`rectify`, or
`rectify_closeup` with `--lock closeup`) and writes the 2100 px greyscale
canvas as a PGM plus a JSON sidecar with the centre, scale and face. A photo
is named by its file's stem, which must match its name in the marks file.
Both sides read the PGM and take the face from the sidecar, so a difference
is the algorithm. `diff` exits non-zero on a candidate or proposal found by
one side only, or a value past the lock-step fixture's tolerances. Run with
spike/cv on PYTHONPATH.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time

# The lock-step fixture's tolerances (hole-proposals.test.ts): relative to
# max(1, |python|); the six texture features mirror a float32 pipeline.
REL = 1e-4
REL_TEXTURE = 1e-3
TEXTURE = ("orient_entropy", "hf_energy", "laplacian_var", "grad_mean", "center_deviation", "std")


def orient_entropy_f64(crop):
    """`hole_filter.features`' orient_entropy in float64, as the TypeScript
    computes it. The reference's float32 angles put gradients near an
    orientation-bin edge in the other bin, which moved the value by up to 0.6%
    on real crops (the fixture's 1e-3 was set on synthetic art), so the diff
    gates the TypeScript on this and reports the gap to the float32 value."""
    import cv2
    import numpy as np

    import hole_filter as HF

    g = crop.astype(np.float64) / 255.0
    gx = cv2.Sobel(g, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_64F, 0, 1, ksize=3)
    gx[np.abs(gx) < HF.GRADIENT_EPSILON] = 0.0
    gy[np.abs(gy) < HF.GRADIENT_EPSILON] = 0.0
    hist, _ = np.histogram(np.arctan2(gy, gx).ravel(), bins=18, range=(-np.pi, np.pi),
                           weights=np.hypot(gx, gy).ravel())
    p = hist / (hist.sum() + 1e-9)
    return float(-(p * np.log(p + 1e-9)).sum())


def prep(out, photos, lock, long_side):
    import cv2

    import eval_hole_proposals as E
    import target_cv as T

    os.makedirs(out, exist_ok=True)
    for p in photos:
        name = os.path.splitext(os.path.basename(p))[0]
        side = os.path.join(out, name + ".json")
        if os.path.exists(side):
            continue
        rec = E.rectify_closeup(p, long_side) if lock == "closeup" else E.rectify(p, long_side)
        if rec is None:
            print(f"{name}: close-up lock failed its gate; skipped", flush=True)
            continue
        cv2.imwrite(os.path.join(out, name + ".pgm"), rec["gray"])
        rings = list(E.PRECISION_RINGS_MM)
        json.dump(dict(photo=name, lock=lock, size=int(rec["gray"].shape[0]),
                       centerXPx=float(rec["center"][0]), centerYPx=float(rec["center"][1]),
                       pxPerMm=float(rec["px_per_mm"]), shift=float(rec["shift"]),
                       caliberMm=T.BULLET_MM, blackRadiusMm=T.TARGETS["precision"]["black_mm"] / 2,
                       maxRadiusMm=rings[-1], ringRadiiMm=rings), open(side, "w"))
        print(f"{name}: prepared", flush=True)


def run(src, out):
    import cv2

    import hole_proposals as HP

    with open(out, "w") as f:
        for name in sorted(n for n in os.listdir(src) if n.endswith(".json")):
            side = json.load(open(os.path.join(src, name)))
            g = cv2.imread(os.path.join(src, side["photo"] + ".pgm"), cv2.IMREAD_GRAYSCALE)
            face = HP.Face(side["centerXPx"], side["centerYPx"], side["pxPerMm"], side["caliberMm"],
                           side["blackRadiusMm"], side["maxRadiusMm"], tuple(side["ringRadiiMm"]))
            t0 = time.time()
            cands = HP.candidates(g, face)
            t1 = time.time()
            props = HP.propose(g, face)
            t2 = time.time()
            row = dict(photo=side["photo"], side=side, msCandidates=round((t1 - t0) * 1000),
                       msPropose=round((t2 - t1) * 1000),
                       candidates=[dict(x=c["x"], y=c["y"], resp=c["resp"], p=HP.probability(c["features"]),
                                        f=c["features"], oe64=orient_entropy_f64(HP.crop48(g, c["x"], c["y"])))
                                   for c in cands],
                       proposals=[dict(x=p.x, y=p.y, p=p.probability, peakX=p.peak_x, peakY=p.peak_y)
                                  for p in props])
            f.write(json.dumps(row) + "\n")
            print(f"{side['photo']}: {len(cands)} candidates, {len(props)} proposals, "
                  f"{row['msCandidates']} + {row['msPropose']} ms", flush=True)


def rel_err(a, b):
    """|a - b| over max(1, |b|), b the reference; NaN/None on either side is
    infinite unless both are."""
    bad_a, bad_b = (v is None or math.isnan(v) for v in (a, b))
    if bad_a or bad_b:
        return 0.0 if bad_a == bad_b else math.inf
    return abs(a - b) / max(1.0, abs(b))


class Worst:
    """Largest |delta| per value, and the values past their tolerance."""

    def __init__(self):
        self.abs: dict[str, float] = {}
        self.rel: dict[str, tuple[float, str]] = {}
        self.beyond: list = []

    def note(self, key, got, ref, where, tol):
        r = rel_err(got, ref)
        e = 0.0 if r == 0.0 else (abs(got - ref) if r < math.inf else math.inf)
        self.abs[key] = max(self.abs.get(key, 0.0), e)
        if r > self.rel.get(key, (-1.0, ""))[0]:
            self.rel[key] = (r, where)
        if tol is not None and r > tol:
            self.beyond.append((where, key, ref, got))

    def show(self):
        for key in sorted(self.abs, key=lambda k: -self.rel[k][0]):
            r, where = self.rel[key]
            print(f"  {key:17} {self.abs[key]:.3e}   rel {r:.3e}  {where}")


def diff(py_path, ts_path):
    import hole_proposals as HP

    py = {r["photo"]: r for r in map(json.loads, open(py_path))}
    ts = {r["photo"]: r for r in map(json.loads, open(ts_path))}
    both = sorted(set(py) & set(ts))
    # raw: against the reference as it runs; gated: orient_entropy against its
    # float64 recomputation, probabilities against the reference's logistic on it
    raw, gated = Worst(), Worst()
    only_py, only_ts, prop_diff = [], [], []
    n_cands = 0

    def p64(c):
        return HP.probability({**c["f"], "orient_entropy": c["oe64"]})

    for k in both:
        a = {(c["x"], c["y"]): c for c in py[k]["candidates"]}
        b = {(c["x"], c["y"]): c for c in ts[k]["candidates"]}
        only_py += [(k, xy) for xy in sorted(set(a) - set(b))]
        only_ts += [(k, xy) for xy in sorted(set(b) - set(a))]
        for xy in sorted(set(a) & set(b)):
            n_cands += 1
            ca, cb = a[xy], b[xy]
            where = f"{k} {xy}"
            raw.note("resp", cb["resp"], ca["resp"], where, REL)
            raw.note("probability", cb["p"], ca["p"], where, None)
            for name, v in ca["f"].items():
                tol = None if name == "orient_entropy" else REL_TEXTURE if name in TEXTURE else REL
                raw.note(name, cb["f"].get(name), v, where, tol)
            gated.note("orient_entropy", cb["f"]["orient_entropy"], ca["oe64"], where, REL)
            gated.note("probability", cb["p"], p64(ca), where, REL)
        pa, pb = py[k]["proposals"], ts[k]["proposals"]
        if [(p["peakX"], p["peakY"]) for p in pa] != [(p["peakX"], p["peakY"]) for p in pb]:
            prop_diff.append((k, "peaks", [(p["peakX"], p["peakY"]) for p in pa],
                              [(p["peakX"], p["peakY"]) for p in pb]))
            continue
        for p, q in zip(pa, pb):
            where = f"{k} ({p['peakX']}, {p['peakY']})"
            n = len(gated.beyond)
            gated.note("proposal x", q["x"], p["x"], where, REL)
            gated.note("proposal y", q["y"], p["y"], where, REL)
            gated.note("proposal p", q["p"], p64(a[(p["peakX"], p["peakY"])]), where, REL)
            raw.note("proposal p", q["p"], p["p"], where, None)
            prop_diff += [(k, key, ref, got) for _, key, ref, got in gated.beyond[n:]]
            del gated.beyond[n:]

    ms = {s: [r[f] for r in rows for f in ("msCandidates", "msPropose")] for s, rows in
          (("python", [py[k] for k in both]), ("ts", [ts[k] for k in both]))}
    print(f"{len(both)} canvases, {n_cands} candidates on both sides")
    for s, v in ms.items():
        c, p = v[0::2], v[1::2]
        print(f"  {s:6} ms/canvas: candidates mean {sum(c) / len(c):.0f} (max {max(c)}), "
              f"proposeHoles mean {sum(p) / len(p):.0f} (max {max(p)})")
    print(f"candidates on the Python side only: {len(only_py)} {only_py[:10]}")
    print(f"candidates on the TS side only:     {len(only_ts)} {only_ts[:10]}")
    print("max |delta| against the reference (absolute; worst relative, where):")
    raw.show()
    print("orient_entropy against its float64 recomputation, probabilities against the "
          "reference's logistic on that value:")
    gated.show()
    beyond = raw.beyond + gated.beyond
    print(f"values beyond tolerance (rel {REL:g}, texture {REL_TEXTURE:g}): {len(beyond)} {beyond[:10]}")
    print(f"proposals that differ: {len(prop_diff)} {prop_diff[:10]}")
    one = sorted(set(py) ^ set(ts))
    if one:
        print(f"in one file only: {len(one)} {one[:10]}")
    return 0 if not (only_py or only_ts or beyond or prop_diff or one) else 1


def read_marks(path):
    marks = {}
    for line in open(os.path.expanduser(path)):
        parts = line.split()
        if parts:
            marks[parts[0]] = [tuple(float(v) for v in p.split(",")) for p in parts[1:]]
    return marks


def score(ts_path, marks_path, csv_path=None):
    """eval_hole_proposals.py --report's rule on the TypeScript's own output:
    every candidate matched to the marks (0.9 d, nearest first), then the
    proposals counted at the shipped threshold, and the other thresholds
    re-selected from the candidates as the report does. This applies the
    shipped constants to the photos they were fitted on; the spec's headline
    is cross-validated, which `--csv` plus fit_hole_proposals.py reproduces."""
    import eval_hole_proposals as E
    import hole_proposals as HP

    marks = read_marks(marks_path)
    rows = {r["photo"]: r for r in map(json.loads, open(ts_path))}
    missing = sorted(set(marks) - set(rows))
    photos = []
    for name, holes in marks.items():
        if name not in rows:
            continue
        r, s = rows[name], rows[name]["side"]
        d = s["caliberMm"] * s["pxPerMm"]
        here = [(x + s["shift"], y + s["shift"]) for x, y in holes]
        labels, missed = E.match(r["candidates"], here, d)
        photos.append(dict(name=name, holes=len(here), missed=missed, d=d, labels=labels, row=r))
    if not photos:
        print("no photo in both files")
        return 1
    holes = sum(p["holes"] for p in photos)
    print(f"{len(photos)} photos, {holes} holes, stage misses {sum(p['missed'] for p in photos)}"
          + (f"; not in the TS output: {missing}" if missing else ""))
    print("  thr   recall  precision  FP/photo  exact")
    for thr in (0.3, 0.4, 0.5, 0.6, HP.THRESHOLD, 0.8):
        tp = fp = exact = 0
        for p in photos:
            cands = p["row"]["candidates"]
            if thr == HP.THRESHOLD:
                # the TS proposals themselves: their peaks are candidates
                index = {(c["x"], c["y"]): i for i, c in enumerate(cands)}
                kept = [p["labels"][index[(q["peakX"], q["peakY"])]] for q in p["row"]["proposals"]]
            else:
                acc = sorted([(c["p"], c, lab) for c, lab in zip(cands, p["labels"]) if c["p"] >= thr],
                             key=lambda t: -t[0])
                chosen = []
                for _, c, lab in acc:
                    if any(math.hypot(c["x"] - k["x"], c["y"] - k["y"]) < HP.MERGE_RADIUS_D * p["d"]
                           for k, _ in chosen):
                        continue
                    chosen.append((c, lab))
                kept = [lab for _, lab in chosen]
            t_ = sum(kept)
            f_ = len(kept) - t_
            tp += t_
            fp += f_
            if f_ == 0 and p["missed"] == 0 and t_ == p["holes"] and t_:
                exact += 1
        tag = "  <- TS proposals" if thr == HP.THRESHOLD else ""
        print(f"  {thr:4.2f}  {tp / holes:6.1%}  {tp / max(1, tp + fp):8.1%}  {fp / len(photos):8.2f}  "
              f"{exact:4d}/{len(photos)}{tag}")
    if csv_path:
        # eval_hole_proposals.py --out's format, for fit_hole_proposals.py
        with open(os.path.expanduser(csv_path), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["photo", "label", "x", "y", "resp", *HP.FEATURE_NAMES])
            for p in photos:
                for c, lab in zip(p["row"]["candidates"], p["labels"]):
                    w.writerow([p["name"], lab, c["x"], c["y"], round(c["resp"], 4),
                                *(round(c["f"][k], 6) for k in HP.FEATURE_NAMES)])
        print("wrote", csv_path)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("prep")
    a.add_argument("out")
    a.add_argument("photos", nargs="+")
    a.add_argument("--lock", choices=("disc", "closeup"), default="disc")
    a.add_argument("--long-side", type=int, default=2048)
    a = sub.add_parser("run")
    a.add_argument("src")
    a.add_argument("out")
    a = sub.add_parser("diff")
    a.add_argument("py")
    a.add_argument("ts")
    a = sub.add_parser("score")
    a.add_argument("ts")
    a.add_argument("marks")
    a.add_argument("--csv", help="also write the labelled candidates for fit_hole_proposals.py")
    a = ap.parse_args()
    if a.cmd == "prep":
        prep(a.out, a.photos, a.lock, a.long_side)
    elif a.cmd == "run":
        run(a.src, a.out)
    elif a.cmd == "diff":
        sys.exit(diff(a.py, a.ts))
    else:
        sys.exit(score(a.ts, a.marks, a.csv))


if __name__ == "__main__":
    main()
