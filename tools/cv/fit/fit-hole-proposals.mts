// fit_hole_proposals.py in TypeScript: the logistic regression behind
// HOLE_PROPOSAL_WEIGHTS / HOLE_PROPOSAL_BIAS, cross-validated 5-fold by photo
// with the Python's folds, then fitted on everything.
//
//   node tools/cv/fit/fit-hole-proposals.mts candidates.csv --marks marks.txt
//   node tools/cv/fit/fit-hole-proposals.mts a.csv --test b.csv --marks marks.txt
//
// Input is the candidates CSV `parity_holes.py score --csv` (or
// eval_hole_proposals.py --out) writes; every column after `resp` is a feature.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  auc,
  aucText,
  crossValidate,
  expandHome,
  fit,
  fixed,
  num,
  percent,
  predict,
  readCsv,
} from './logistic.mts';

/** hole-proposals.ts MERGE_RADIUS_D and the caliber of `ProposalFace`. */
const MERGE_RADIUS_D = 1.0;
const BULLET_MM = 5.6;
const FIXED_COLUMNS = ['photo', 'label', 'x', 'y', 'resp'];

interface Corpus {
  name: string;
  features: string[];
  x: number[][];
  y: number[];
  photos: string[];
  xy: [number, number][];
}

function load(path: string): Corpus {
  const { name, rows } = readCsv(path);
  const features = Object.keys(rows[0] ?? {}).filter((k) => !FIXED_COLUMNS.includes(k));
  return {
    name,
    features,
    x: rows.map((r) => features.map((k) => num(r, k))),
    y: rows.map((r) => num(r, 'label')),
    photos: rows.map((r) => r.photo!),
    xy: rows.map((r) => [num(r, 'x'), num(r, 'y')]),
  };
}

function report(
  label: string,
  c: Corpus,
  scores: number[],
  holesPerPhoto: Map<string, number>,
  d: number,
): void {
  const photos = [...new Set(c.photos)].sort();
  const holeCount = (p: string) => {
    const n = holesPerPhoto.get(p);
    if (n === undefined) throw new Error(`photo ${p} is not in the marks file`);
    return n;
  };
  const holes = photos.reduce((s, p) => s + holeCount(p), 0);
  const positives = c.y.reduce((s, v) => s + v, 0);
  console.log(
    `\n${label}: ${c.y.length} candidates, ${positives} on holes, ${holes} holes, ` +
      `${photos.length} photos, AUC ${aucText(auc(scores, c.y))}`,
  );
  console.log('  thr   recall  precision  FP/photo  exact');
  const byPhoto = new Map<string, number[]>();
  c.photos.forEach((p, i) => {
    if (!byPhoto.has(p)) byPhoto.set(p, []);
    byPhoto.get(p)!.push(i);
  });
  for (const thr of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    let tp = 0;
    let fp = 0;
    let exact = 0;
    for (const p of photos) {
      const idx = byPhoto
        .get(p)!
        .filter((i) => scores[i]! >= thr)
        .sort((i, j) => scores[j]! - scores[i]! || i - j);
      const kept: number[] = [];
      for (const i of idx) {
        const [xi, yi] = c.xy[i]!;
        if (kept.some((j) => Math.hypot(xi - c.xy[j]![0], yi - c.xy[j]![1]) < MERGE_RADIUS_D * d)) {
          continue;
        }
        kept.push(i);
      }
      const t = kept.reduce((s, i) => s + c.y[i]!, 0);
      const f = kept.length - t;
      tp += t;
      fp += f;
      if (f === 0 && t === holeCount(p) && t) exact += 1;
    }
    console.log(
      `  ${fixed(thr, 2, 4)}  ${percent(tp / holes, 6)}  ${percent(tp / Math.max(1, tp + fp), 8)}  ` +
        `${fixed(fp / photos.length, 2, 8)}  ${String(exact).padStart(4)}`,
    );
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      test: { type: 'string', multiple: true, default: [] },
      marks: { type: 'string' },
      folds: { type: 'string', default: '5' },
      seed: { type: 'string', default: '0' },
      'px-per-mm': { type: 'string', default: '4.0' },
    },
  });
  if (positionals.length === 0 || !values.marks) {
    throw new Error(
      'usage: fit-hole-proposals.mts <train.csv>... [--test b.csv] --marks marks.txt',
    );
  }
  const folds = Number(values.folds);
  const d = BULLET_MM * Number(values['px-per-mm']);
  const holesPerPhoto = new Map<string, number>();
  for (const line of readFileSync(expandHome(values.marks), 'utf8').split('\n')) {
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length) holesPerPhoto.set(parts[0]!, parts.length - 1);
  }

  const parts = positionals.map(load);
  const features = parts[0]!.features;
  for (const p of parts) {
    if (p.features.join() !== features.join()) throw new Error(`${p.name}: other feature columns`);
  }
  const train: Corpus = {
    name: parts.map((p) => p.name).join('+'),
    features,
    x: parts.flatMap((p) => p.x),
    y: parts.flatMap((p) => p.y),
    photos: parts.flatMap((p) => p.photos),
    xy: parts.flatMap((p) => p.xy),
  };
  const cv = crossValidate(train.x, train.y, train.photos, folds, Number(values.seed));
  report(`${train.name} ${folds}-fold by photo`, train, cv, holesPerPhoto, d);

  const model = fit(train.x, train.y);
  console.log('\nfitted constants (raw feature scale):');
  console.log('WEIGHTS = {');
  features.forEach((k, j) => console.log(`    "${k}": ${model.w[j]!.toFixed(6)},`));
  console.log('}');
  console.log(`BIAS = ${model.b.toFixed(6)}`);

  for (const path of values.test) {
    const held = load(path);
    if (held.features.join() !== features.join()) throw new Error(`${path}: other feature columns`);
    report(
      `${held.name} HELD OUT`,
      held,
      held.x.map((row) => predict(model, row)),
      holesPerPhoto,
      d,
    );
  }
}

main();
