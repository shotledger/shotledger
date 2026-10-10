// Summarises hole-size-timing.eval.ts runs: per detector run the quartiles of
// each stage, the JS outside OpenCV (maps + peaks - ops), features per peak,
// and how well the peak count predicts the check's time. Counts only.
//
//   node tools/cv/eval/hole-size-timing.mts <run.jsonl>...
import { readFileSync } from 'node:fs';

interface Run {
  caliberMm: number;
  mapsMs: number;
  peaksMs: number;
  opsMs: number;
  featuresMs: number;
  peaks: number;
  kept: number;
}
interface Check {
  ms: number;
  tooSmall: boolean;
  halfRun: boolean;
  confident: number;
  runs: Run[];
}
interface Row {
  photo: string;
  full: Check;
  halved?: Check;
}

const rows: Row[] = process.argv
  .slice(2)
  .flatMap((f) => readFileSync(f, 'utf8').trim().split('\n'))
  .map((line) => JSON.parse(line) as Row);

const at = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
function quartiles(values: number[]): string {
  const s = [...values].sort((a, b) => a - b);
  const r = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return `min ${r(s[0] as number)}  p25 ${r(at(s, 0.25))}  median ${r(at(s, 0.5))}  p75 ${r(at(s, 0.75))}  max ${r(s[s.length - 1] as number)}`;
}
function correlation(x: number[], y: number[]): number {
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  x.forEach((v, i) => {
    const dy = (y[i] as number) - my;
    sxy += (v - mx) * dy;
    sxx += (v - mx) ** 2;
    syy += dy ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
}

for (const halfRun of [false, true]) {
  const set = rows.filter((r) => r.full.halfRun === halfRun);
  if (set.length === 0) continue;
  console.log(`\nhalf-calibre run ${halfRun ? 'yes' : 'no'}: ${set.length} canvases`);
  console.log(`  check ms        ${quartiles(set.map((r) => r.full.ms))}`);
  for (const k of [0, 1]) {
    const runs = set.map((r) => r.full.runs[k]).filter((r): r is Run => r !== undefined);
    if (runs.length === 0) continue;
    console.log(`  run at ${runs[0]!.caliberMm} mm`);
    console.log(`    maps ms       ${quartiles(runs.map((r) => r.mapsMs))}`);
    console.log(`    peaks ms      ${quartiles(runs.map((r) => r.peaksMs))}`);
    console.log(`    in ops ms     ${quartiles(runs.map((r) => r.opsMs))}`);
    console.log(`    JS maps+peaks ${quartiles(runs.map((r) => r.mapsMs + r.peaksMs - r.opsMs))}`);
    console.log(`    features ms   ${quartiles(runs.map((r) => r.featuresMs))}`);
    console.log(`    peaks         ${quartiles(runs.map((r) => r.peaks))}`);
    console.log(
      `    ms per peak   ${quartiles(runs.map((r) => r.featuresMs / Math.max(1, r.peaks)))}`,
    );
  }
}
const featurePeaks = rows.map((r) => r.full.runs.reduce((s, u) => s + u.peaks, 0));
const featureMs = rows.map((r) => r.full.runs.reduce((s, u) => s + u.featuresMs, 0));
const jsMs = rows.map((r) =>
  r.full.runs.reduce((s, u) => s + u.mapsMs + u.peaksMs - u.opsMs + u.featuresMs, 0),
);
console.log(`\n${rows.length} canvases, ${rows.filter((r) => r.full.tooSmall).length} refused`);
console.log(`  JS outside OpenCV ms  ${quartiles(jsMs)}`);
console.log(
  `  correlation of features ms with peaks: ${correlation(featurePeaks, featureMs).toFixed(2)}`,
);
console.log(
  `  correlation of JS ms with peaks:       ${correlation(featurePeaks, jsMs).toFixed(2)}`,
);

const halved = rows.filter((r) => r.halved);
if (halved.length > 0) {
  const changed = (f: (c: Check) => unknown) =>
    halved.filter((r) => f(r.full) !== f(r.halved!)).length;
  console.log(`\nhalved canvas, ${halved.length} canvases`);
  console.log(`  check ms ${quartiles(halved.map((r) => r.halved!.ms))}`);
  console.log(
    `  differs from the full canvas: verdict ${changed((c) => c.tooSmall)}, half-calibre run ${changed((c) => c.halfRun)}, confident candidates ${changed((c) => c.confident)}`,
  );
}
