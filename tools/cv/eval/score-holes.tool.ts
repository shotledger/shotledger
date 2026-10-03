// A holes.eval.ts run measured against hand marks. Every candidate is matched
// to the marks (within 0.9 hole diameters, nearest pair first), then the
// proposals are counted at the shipped threshold and the other thresholds
// re-selected from the candidates by the same merge. This applies the
// shipped constants to the photos they were fitted on; the spec's headline is
// cross-validated, which CV_SCORE_CSV plus fit-hole-proposals.mts reproduces.
//
//   CV_SCORE_RUN=run.jsonl CV_SCORE_MARKS=marks.txt [CV_SCORE_CSV=candidates.csv] \
//     pnpm exec vitest run --silent=false -c tools/cv/vitest.config.ts score-holes
//
// Marks are in mark-holes' label px; the sidecar's `shift` moves them onto the
// canvas. Marks name real photos: keep them, and the CSV, outside the repo.
import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import {
  HOLE_PROPOSAL_FEATURE_NAMES,
  HOLE_PROPOSAL_THRESHOLD,
  MERGE_RADIUS_D,
} from '../../../app/src/features/photo-scoring/hole-proposals';
import { expandHome } from '../fit/label-canvas';
import { readMarks } from '../fit/score-stages';
import { pyFixed } from '../fit/logistic.mts';
import { pyRepr, pyRound } from '../py-format';

const MATCH_DIAMETERS = 0.9;

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON lines */
type Row = Record<string, any>;
interface Candidate {
  readonly x: number;
  readonly y: number;
  readonly resp: number;
  readonly p: number;
  readonly f: Record<string, number>;
}

/** Nearest-pair-first matching: a label per candidate and the unclaimed marks. */
function match(cands: readonly Candidate[], holes: readonly [number, number][], d: number) {
  const pairs: [number, number, number][] = [];
  cands.forEach((c, i) =>
    holes.forEach(([hx, hy], j) => {
      const dist = Math.hypot(c.x - hx, c.y - hy);
      if (dist < MATCH_DIAMETERS * d) pairs.push([dist, i, j]);
    }),
  );
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const usedC = new Set<number>();
  const usedH = new Set<number>();
  const labels = cands.map(() => 0);
  for (const [, i, j] of pairs) {
    if (usedC.has(i) || usedH.has(j)) continue;
    usedC.add(i);
    usedH.add(j);
    labels[i] = 1;
  }
  return { labels, missed: holes.length - usedH.size };
}

const runPath = process.env.CV_SCORE_RUN;
const marksPath = process.env.CV_SCORE_MARKS;

test.skipIf(!runPath || !marksPath)('hole proposals against hand marks', () => {
  const marks = readMarks(marksPath!);
  const rows = new Map<string, Row>(
    readFileSync(expandHome(runPath!), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row)
      .map((r) => [r.photo as string, r]),
  );
  const missing = [...marks.keys()].filter((k) => !rows.has(k)).sort();
  const photos = [...marks]
    .filter(([name]) => rows.has(name))
    .map(([name, holes]) => {
      const row = rows.get(name)!;
      const s = row.side;
      const d = s.caliberMm * s.pxPerMm;
      const here = holes.map(([x, y]) => [x + s.shift, y + s.shift] as [number, number]);
      return { name, holes: here.length, d, row, ...match(row.candidates, here, d) };
    });
  expect(photos.length).toBeGreaterThan(0);
  const holes = photos.reduce((n, p) => n + p.holes, 0);
  console.log(
    `${photos.length} photos, ${holes} holes, stage misses ${photos.reduce((n, p) => n + p.missed, 0)}` +
      (missing.length ? `; not in the run: ${missing.join(' ')}` : ''),
  );
  console.log('  thr   recall  precision  FP/photo  exact');
  for (const thr of [0.3, 0.4, 0.5, 0.6, HOLE_PROPOSAL_THRESHOLD, 0.8]) {
    let tp = 0;
    let fp = 0;
    let exact = 0;
    for (const p of photos) {
      const cands: Candidate[] = p.row.candidates;
      let kept: number[];
      if (thr === HOLE_PROPOSAL_THRESHOLD) {
        // the run's own proposals: their peaks are candidates
        const index = new Map(cands.map((c, i) => [`${c.x},${c.y}`, i]));
        kept = p.row.proposals.map((q: Row) => p.labels[index.get(`${q.peakX},${q.peakY}`)!]!);
      } else {
        const chosen: [Candidate, number][] = [];
        cands
          .map((c, i) => [c, p.labels[i]!] as const)
          .filter(([c]) => c.p >= thr)
          .sort((a, b) => b[0].p - a[0].p)
          .forEach(([c, lab]) => {
            if (chosen.some(([k]) => Math.hypot(c.x - k.x, c.y - k.y) < MERGE_RADIUS_D * p.d))
              return;
            chosen.push([c, lab]);
          });
        kept = chosen.map(([, lab]) => lab);
      }
      const t = kept.reduce((s, v) => s + v, 0);
      const f = kept.length - t;
      tp += t;
      fp += f;
      if (f === 0 && p.missed === 0 && t === p.holes && t) exact += 1;
    }
    const pct = (v: number) => `${pyFixed(v * 100, 1)}%`;
    console.log(
      `  ${pyFixed(thr, 2).padStart(4)}  ${pct(tp / holes).padStart(6)}  ${pct(tp / Math.max(1, tp + fp)).padStart(8)}  ` +
        `${pyFixed(fp / photos.length, 2).padStart(8)}  ${String(exact).padStart(4)}/${photos.length}` +
        (thr === HOLE_PROPOSAL_THRESHOLD ? '  <- proposals' : ''),
    );
  }
  const csvPath = process.env.CV_SCORE_CSV;
  if (csvPath) {
    // fit-hole-proposals.mts's input; a whole number in the JSON stays one
    const field = (v: number, digits: number) =>
      Number.isInteger(v) ? String(v) : pyRepr(pyRound(v, digits));
    const lines = [['photo', 'label', 'x', 'y', 'resp', ...HOLE_PROPOSAL_FEATURE_NAMES].join(',')];
    for (const p of photos) {
      (p.row.candidates as Candidate[]).forEach((c, i) => {
        lines.push(
          [
            p.name,
            p.labels[i],
            c.x,
            c.y,
            field(c.resp, 4),
            ...HOLE_PROPOSAL_FEATURE_NAMES.map((k) => field(c.f[k]!, 6)),
          ].join(','),
        );
      });
    }
    writeFileSync(expandHome(csvPath), lines.join('\r\n') + '\r\n');
    console.log(`wrote ${csvPath}`);
  }
});
