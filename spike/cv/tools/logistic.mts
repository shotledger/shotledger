// The estimator, folds and table helpers fit_hole_filter.py and
// fit_hole_proposals.py share, in plain TypeScript: Newton's method on
// standardised features with a small L2 ridge (not on the bias), folded back
// to raw scale, exactly as `fit_hole_filter.fit` does with numpy.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';

import { Pcg64 } from './numpy-random.mts';

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export const expandHome = (path: string): string =>
  path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path;

/** A CSV as Python's csv module writes it: a header, then rows of fields. */
export function readCsv(path: string): { name: string; rows: Record<string, string>[] } {
  const text = readFileSync(expandHome(path), 'utf8');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || record.length > 0) records.push([...record, field]);
  const [header, ...body] = records;
  if (!header) throw new Error(`${path}: empty`);
  return {
    name: basename(path),
    rows: body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? '']))),
  };
}

/** Python's float(): a field that does not parse is an error, not NaN. */
export function num(row: Record<string, string>, key: string): number {
  const v = row[key];
  if (v === undefined || v.trim() === '' || Number.isNaN(Number(v))) {
    throw new Error(`column ${key}: not a number: ${JSON.stringify(v)}`);
  }
  return Number(v);
}

/** Solve `a x = b` by Gaussian elimination with partial pivoting (LAPACK gesv's method). */
function solve(a: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  const m = a.map((row, i) => {
    const r = new Float64Array(n + 1);
    r.set(row);
    r[n] = b[i]!;
    return r;
  });
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (m[pivot]![col] === 0) throw new Error('singular Hessian');
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]!;
    for (let r = col + 1; r < n; r += 1) {
      const row = m[r]!;
      const f = row[col]! / p[col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) row[c] = row[c]! - f * p[c]!;
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    const row = m[r]!;
    let s = row[n]!;
    for (let c = r + 1; c < n; c += 1) s -= row[c]! * x[c]!;
    x[r] = s / row[r]!;
  }
  return x;
}

export interface Fit {
  readonly w: number[];
  readonly b: number;
}

/** `fit_hole_filter.fit`: Newton on standardised features; raw-scale (w, b). */
export function fit(x: readonly number[][], y: readonly number[], ridge = 1e-2, iters = 50): Fit {
  const n = x.length;
  const k = x[0]!.length;
  const mu = new Array<number>(k).fill(0);
  const sd = new Array<number>(k).fill(0);
  for (const row of x) for (let j = 0; j < k; j += 1) mu[j]! += row[j]!;
  for (let j = 0; j < k; j += 1) mu[j]! /= n;
  for (const row of x) for (let j = 0; j < k; j += 1) sd[j]! += (row[j]! - mu[j]!) ** 2;
  for (let j = 0; j < k; j += 1) sd[j] = Math.sqrt(sd[j]! / n) + 1e-9;
  // z with a trailing 1 for the bias
  const a = x.map((row) => {
    const r = new Float64Array(k + 1);
    for (let j = 0; j < k; j += 1) r[j] = (row[j]! - mu[j]!) / sd[j]!;
    r[k] = 1;
    return r;
  });
  const w = new Float64Array(k + 1);
  for (let it = 0; it < iters; it += 1) {
    const grad = new Float64Array(k + 1);
    const hess = Array.from({ length: k + 1 }, () => new Float64Array(k + 1));
    for (let i = 0; i < n; i += 1) {
      const ai = a[i]!;
      let z = 0;
      for (let j = 0; j <= k; j += 1) z += ai[j]! * w[j]!;
      const p = sigmoid(z);
      const r = p - y[i]!;
      const s = p * (1 - p);
      for (let j = 0; j <= k; j += 1) {
        grad[j]! += ai[j]! * r;
        const hj = hess[j]!;
        const sj = s * ai[j]!;
        for (let l = j; l <= k; l += 1) hj[l]! += sj * ai[l]!;
      }
    }
    for (let j = 0; j <= k; j += 1) {
      for (let l = 0; l < j; l += 1) hess[j]![l] = hess[l]![j]!;
      if (j < k) {
        grad[j]! += ridge * w[j]!;
        hess[j]![j]! += ridge;
      }
    }
    const step = solve(hess, grad);
    let worst = 0;
    for (let j = 0; j <= k; j += 1) {
      w[j]! -= step[j]!;
      worst = Math.max(worst, Math.abs(step[j]!));
    }
    if (worst < 1e-8) break;
  }
  const raw = Array.from({ length: k }, (_, j) => w[j]! / sd[j]!);
  let b = w[k]!;
  for (let j = 0; j < k; j += 1) b -= (w[j]! * mu[j]!) / sd[j]!;
  return { w: raw, b };
}

export const predict = (f: Fit, row: readonly number[]): number => {
  let z = f.b;
  for (let j = 0; j < row.length; j += 1) z += row[j]! * f.w[j]!;
  return sigmoid(z);
};

/** ROC AUC by mean ranks, ties averaged (`fit_hole_filter.auc`). */
export function auc(scores: readonly number[], y: readonly number[]): number {
  const order = scores.map((_, i) => i).sort((i, j) => scores[i]! - scores[j]!);
  const ranks = new Float64Array(scores.length);
  for (let lo = 0; lo < order.length;) {
    let hi = lo;
    while (hi + 1 < order.length && scores[order[hi + 1]!] === scores[order[lo]!]) hi += 1;
    for (let t = lo; t <= hi; t += 1) ranks[order[t]!] = (lo + hi) / 2 + 1;
    lo = hi + 1;
  }
  const npos = y.reduce((s, v) => s + v, 0);
  const nneg = y.length - npos;
  if (npos === 0 || nneg === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < y.length; i += 1) if (y[i] === 1) sum += ranks[i]!;
  return (sum - (npos * (npos + 1)) / 2) / (npos * nneg);
}

/**
 * Cross-validated probabilities, folds split by photo: the sorted photo names
 * shuffled by `default_rng(seed)`, fold i taking every `folds`-th from i.
 */
export function crossValidate(
  x: readonly number[][],
  y: readonly number[],
  photos: readonly string[],
  folds: number,
  seed: number,
): number[] {
  // Python sorts str by code point; names are ASCII, where that is JS's order
  const names = new Pcg64(seed).shuffle([...new Set(photos)].sort());
  const cv = new Array<number>(y.length).fill(0);
  for (let f = 0; f < folds; f += 1) {
    const fold = new Set(names.filter((_, i) => i % folds === f));
    const train = photos.map((p, i) => (fold.has(p) ? -1 : i)).filter((i) => i >= 0);
    const model = fit(
      train.map((i) => x[i]!),
      train.map((i) => y[i]!),
    );
    photos.forEach((p, i) => {
      if (fold.has(p)) cv[i] = predict(model, x[i]!);
    });
  }
  return cv;
}

/**
 * Python's `f"{v:.{digits}f}"`. Both round the exact binary value, but on an
 * exact tie (69/80 as a percent is 86.25) Python goes to even and toFixed away
 * from zero.
 */
export function pyFixed(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const exact = Math.abs(v).toFixed(100);
  const cut = exact.indexOf('.') + 1 + digits;
  if (!/^50*$/.test(exact.slice(cut))) return s;
  const last = Number(exact[cut - 1] === '.' ? exact[cut - 2] : exact[cut - 1]);
  if (last % 2 === 1) return s;
  const down = exact.slice(0, digits === 0 ? cut - 1 : cut);
  return (v < 0 ? '-' : '') + down;
}

// Python's format specs, for tables that diff cleanly against the Python's.
export const fixed = (v: number, digits: number, width = 0): string =>
  pyFixed(v, digits).padStart(width);
export const percent = (v: number, width: number): string =>
  `${pyFixed(v * 100, 1)}%`.padStart(width);
export const signed = (v: number, digits: number): string =>
  (v >= 0 ? '+' : '') + pyFixed(v, digits);
export const aucText = (v: number): string => (Number.isNaN(v) ? 'nan' : v.toFixed(3));
