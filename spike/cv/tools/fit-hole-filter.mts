// fit_hole_filter.py in TypeScript: the hole/patch filter's logistic
// regression (HOLE_FILTER_WEIGHTS / HOLE_FILTER_BIAS in hole-features.ts),
// cross-validated 5-fold by photo with the Python's folds, then fitted on
// everything.
//
//   node spike/cv/tools/fit-hole-filter.mts --stage tight pooled.csv
//   node spike/cv/tools/fit-hole-filter.mts --stage tight a.csv --test b.csv
//
// Input is score_stages.py's candidates CSV: one row per candidate with its
// label and features, plus a `cand = -1` row per photo and stage whose `r_mm`
// holds that photo's miss count. Every column after `r_mm` is a feature.
import { parseArgs } from 'node:util';

import {
  auc,
  aucText,
  crossValidate,
  fit,
  fixed,
  num,
  percent,
  predict,
  readCsv,
  signed,
} from './logistic.mts';

const FIXED_COLUMNS = ['photo', 'stage', 'cand', 'label', 'edge', 'r_mm'];

interface Corpus {
  name: string;
  features: string[];
  x: number[][];
  y: number[];
  photos: string[];
  missed: Map<string, number>;
}

function load(path: string, stage: string): Corpus {
  const { name, rows: all } = readCsv(path);
  const features = Object.keys(all[0] ?? {}).filter((k) => !FIXED_COLUMNS.includes(k));
  const rows = all.filter((r) => r.stage === stage);
  const missed = new Map(
    rows.filter((r) => r.cand === '-1').map((r) => [r.photo!, Math.trunc(num(r, 'r_mm'))]),
  );
  // A candidate at the canvas edge has no crop, so no features: it never
  // reaches the filter and stays out of both fit and report.
  const cands = rows.filter((r) => r.cand !== '-1' && r.edge === '0');
  return {
    name,
    features,
    x: cands.map((r) => features.map((k) => num(r, k))),
    y: cands.map((r) => num(r, 'label')),
    photos: cands.map((r) => r.photo!),
    missed,
  };
}

function report(label: string, c: Corpus, scores: number[]): void {
  const photos = [...new Set([...c.photos, ...c.missed.keys()])].sort();
  const positives = c.y.reduce((s, v) => s + v, 0);
  const holes = positives + [...c.missed.values()].reduce((s, v) => s + v, 0);
  console.log(
    `\n${label}: ${c.y.length} candidates, ${positives} on holes, ` +
      `${holes} holes, ${photos.length} photos, AUC ${aucText(auc(scores, c.y))}`,
  );
  console.log('  thr   recall  precision  FP/photo  exact');
  for (const thr of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    let tp = 0;
    let fp = 0;
    let exact = 0;
    for (const p of photos) {
      let t = 0;
      let f = 0;
      let onHoles = 0;
      c.photos.forEach((q, i) => {
        if (q !== p) return;
        onHoles += c.y[i]!;
        if (scores[i]! >= thr) {
          if (c.y[i] === 1) t += 1;
          else f += 1;
        }
      });
      tp += t;
      fp += f;
      if (f === 0 && (c.missed.get(p) ?? 0) === 0 && t === onHoles && t) exact += 1;
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
      stage: { type: 'string', default: 'tight' },
      folds: { type: 'string', default: '5' },
      seed: { type: 'string', default: '0' },
    },
  });
  if (positionals.length === 0) {
    throw new Error('usage: fit-hole-filter.mts [--stage tight] <train.csv>... [--test b.csv]');
  }
  const { stage } = values;
  const folds = Number(values.folds);
  const parts = positionals.map((p) => load(p, stage));
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
    missed: new Map(parts.flatMap((p) => [...p.missed])),
  };

  // Folds split BY PHOTO: crops from one photo share lighting, paper and
  // patches, so splitting by candidate would leak and flatter the score.
  const cv = crossValidate(train.x, train.y, train.photos, folds, Number(values.seed));
  report(`${train.name} [${stage}] ${folds}-fold by photo`, train, cv);

  const model = fit(train.x, train.y);
  console.log('\nfitted constants (raw feature scale):');
  features.forEach((k, j) => console.log(`  ${k.padEnd(18)} ${signed(model.w[j]!, 4)}`));
  console.log(`  ${'bias'.padEnd(18)} ${signed(model.b, 4)}`);

  for (const path of values.test) {
    const held = load(path, stage);
    if (held.features.join() !== features.join()) throw new Error(`${path}: other feature columns`);
    report(
      `${held.name} [${stage}] HELD OUT`,
      held,
      held.x.map((row) => predict(model, row)),
    );
  }
}

main();
