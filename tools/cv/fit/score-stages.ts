// Score each proposal stage against hand-marked hole centres and dump every
// candidate's texture features: the hole/patch filter's training data, for
// fit-hole-filter.mts.
//
// A candidate is a true positive within 0.9 hole diameters of a mark no
// earlier candidate claimed; every other candidate is a false positive and
// every unclaimed mark a miss. One CSV row per candidate, plus a `cand = -1`
// row per photo and stage whose `r_mm` carries the miss count, so the
// denominator of recall travels with the candidates.
import { readFileSync } from 'node:fs';

import { HOLE_CROP_PX, holeFeatures } from '../../../shared/src/target-scoring/hole-features';
import type { Cv } from '../eval/opencv-js-disc-ops';
import { pyRepr, pyRound, pyRoundInt } from '../py-format';
import {
  LOOSE,
  looseStage,
  OPEN,
  type StageCandidate,
  type StageCanvas,
  stageGray,
  tightStage,
} from './hole-stages';
import { expandHome } from './label-canvas';
import { type Marks, parseMarks } from './marks.mts';

const MATCH_DIAMETERS = 0.9;
const BULLET_MM = 5.6;

export const STAGES: Record<string, (cv: Cv, c: StageCanvas) => StageCandidate[]> = {
  tight: tightStage,
  loose: (cv, c) => looseStage(cv, c, LOOSE),
  open: (cv, c) => looseStage(cv, c, OPEN),
};

/** The CSV's feature columns, in hole_filter's names. */
const FEATURES = [
  ['orient_entropy', 'orientEntropy'],
  ['hf_energy', 'hfEnergy'],
  ['laplacian_var', 'laplacianVar'],
  ['grad_mean', 'gradMean'],
  ['center_deviation', 'centerDeviation'],
  ['std', 'stdDev'],
] as const;

export const HEADER = [
  'photo',
  'stage',
  'cand',
  'label',
  'edge',
  'r_mm',
  ...FEATURES.map(([k]) => k),
];

export type { Marks };

/** A marks file's confirmed marks, in canvas px; pre-labels are skipped. */
export function readMarks(path: string): Marks {
  return parseMarks(readFileSync(expandHome(path), 'utf8'));
}

/** The 48 px crop centred on (x, y), or null at the canvas edge. */
function cropAt(gray: Uint8Array, width: number, height: number, x: number, y: number) {
  const cx = pyRoundInt(x);
  const cy = pyRoundInt(y);
  const half = HOLE_CROP_PX / 2;
  if (cx - half < 0 || cy - half < 0 || cx + half > width || cy + half > height) return null;
  const data = new Uint8Array(HOLE_CROP_PX * HOLE_CROP_PX);
  for (let r = 0; r < HOLE_CROP_PX; r += 1) {
    const at = (cy - half + r) * width + cx - half;
    data.set(gray.subarray(at, at + HOLE_CROP_PX), r * HOLE_CROP_PX);
  }
  return { data, size: HOLE_CROP_PX };
}

/** Every stage's rows for one photo, as CSV fields. */
export function scorePhoto(
  cv: Cv,
  name: string,
  canvas: StageCanvas,
  holes: readonly [number, number][],
): string[][] {
  const gray = stageGray(cv, canvas);
  const d = BULLET_MM * canvas.pxPerMm;
  const rows: string[][] = [];
  for (const [stage, run] of Object.entries(STAGES)) {
    const claimed = new Set<number>();
    run(cv, canvas).forEach((c, i) => {
      let best = -1;
      let bestDist = MATCH_DIAMETERS * d;
      holes.forEach(([hx, hy], j) => {
        if (claimed.has(j)) return;
        const dist = Math.hypot(c.x - hx, c.y - hy);
        if (dist < bestDist) {
          best = j;
          bestDist = dist;
        }
      });
      if (best >= 0) claimed.add(best);
      const crop = cropAt(gray, canvas.width, canvas.height, c.x, c.y);
      const rMm = Math.hypot(c.x - canvas.centerXPx, c.y - canvas.centerYPx) / canvas.pxPerMm;
      const f = crop && holeFeatures(crop);
      rows.push([
        name,
        stage,
        String(i),
        best >= 0 ? '1' : '0',
        crop ? '0' : '1',
        pyRepr(pyRound(rMm, 1)),
        ...FEATURES.map(([, key]) => (f ? pyRepr(pyRound(f[key], 6)) : '')),
      ]);
    });
    rows.push([name, stage, '-1', '-1', '0', String(holes.length - claimed.size)]);
  }
  return rows;
}

/** Rows as Python's csv module writes them (no field here needs quoting). */
export const csvText = (rows: string[][]): string =>
  [HEADER, ...rows]
    .map((r) => [...r, ...Array(HEADER.length - r.length).fill('')].join(','))
    .join('\r\n') + '\r\n';
