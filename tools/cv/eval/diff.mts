// Where two runs of an eval tool disagree: a baseline and a candidate, e.g.
// before and after a change to the CV code. Exits non-zero on a disagreement.
//
//   node tools/cv/eval/diff.mts closeup base.jsonl new.jsonl   # closeup.eval.ts
//   node tools/cv/eval/diff.mts disc base.jsonl new.jsonl [--key canvasToMm]
//   node tools/cv/eval/diff.mts holes base.jsonl new.jsonl     # holes.eval.ts
//
// closeup, disc: a lock on one side only, a gate verdict that differs, or
// points the two mappings put on the 25, 50 and 75 mm rings more than
// 0.05 mm apart. `--key` picks the disc mapping (`toMm`, the overlay's and
// chooseLock's, or `canvasToMm`, the canvas tap-snap and the hole proposals
// read).
// holes: a candidate or proposal on one side only, or a value past the
// lock-step fixture's tolerances (hole-proposals.test.ts).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON lines */
type Row = Record<string, any>;

const TOL_MM = 0.05;
const REL = 1e-4;
const REL_TEXTURE = 1e-3;
const TEXTURE = new Set([
  'orient_entropy',
  'hf_energy',
  'laplacian_var',
  'grad_mean',
  'center_deviation',
  'std',
]);

const read = (path: string): Map<string, Row> =>
  new Map(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row)
      .map((r) => [r.photo as string, r]),
  );

const apply = (h: number[], x: number, y: number) => {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w] as const;
};

function invert(h: number[]): number[] {
  const [a, b, c, d, e, f, g, k, i] = h as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * k;
  const B = -(d * i - f * g);
  const C = d * k - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * k) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * k - b * g) / det,
    (a * e - b * d) / det,
  ];
}

/** Worst disagreement in mm over points one mapping puts on the 25, 50 and
 *  75 mm rings, measured through the other. */
function radiusGap(a: number[], b: number[]): number {
  const back = invert(a);
  let worst = 0;
  for (const R of [25, 50, 75]) {
    for (let i = 0; i < 72; i += 1) {
      const t = (2 * Math.PI * i) / 72;
      const [px, py] = apply(back, R * Math.cos(t), R * Math.sin(t));
      const [qx, qy] = apply(b, px, py);
      worst = Math.max(worst, Math.abs(Math.hypot(qx, qy) - R));
    }
  }
  return worst;
}

const meanMs = (rows: Row[], key = 'ms') =>
  rows.reduce((s, r) => s + (r[key] ?? 0), 0) / Math.max(1, rows.length);

function quantile(sorted: number[], q: number): number {
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function locks(base: Map<string, Row>, next: Map<string, Row>, kind: string, key: string): boolean {
  const both = [...base.keys()].filter((k) => next.has(k)).sort();
  const mapping = (r: Row): number[] | null =>
    kind === 'closeup' ? (r.lock?.toMm ?? null) : (r[key] ?? null);
  const verdict = (r: Row) => (kind === 'closeup' ? r.lock?.passes : r.valid);
  let agree = 0;
  const oneSided: string[] = [];
  const gate: string[] = [];
  const off: [string, number][] = [];
  const gaps: number[] = [];
  if (kind === 'disc')
    console.log(`mapping: ${key}\n${'photo'.padEnd(24)} base   new  gap mm  metric deltas`);
  for (const k of both) {
    const a = base.get(k)!;
    const b = next.get(k)!;
    const ha = mapping(a);
    const hb = mapping(b);
    if ((ha === null) !== (hb === null)) {
      oneSided.push(k);
      continue;
    }
    if (verdict(a) !== verdict(b)) gate.push(`${k} ${verdict(a)} -> ${verdict(b)}`);
    if (!ha || !hb) {
      agree += 1;
      continue;
    }
    const g = radiusGap(ha, hb);
    gaps.push(g);
    if (g > TOL_MM) off.push([k, Number(g.toFixed(3))]);
    else agree += 1;
    if (kind === 'disc' && a.metrics && b.metrics) {
      const deltas = ['axisRatio', 'zoneFraction', 'zoneContrastGray', 'profileScore']
        .map((n) => `${n}=${(b.metrics[n] - a.metrics[n]).toFixed(2)}`)
        .join(' ');
      const flag = (r: Row) => (r.valid ? 'pass' : 'FAIL');
      console.log(
        `${k.slice(0, 24).padEnd(24)} ${flag(a)} ${flag(b)} ${g.toFixed(3).padStart(7)}  ${deltas}`,
      );
    }
  }
  const rows = (m: Map<string, Row>) => both.map((k) => m.get(k)!);
  console.log(
    `\n${both.length} photos; ${agree} agree within ${TOL_MM} mm; ` +
      `mean ms base ${meanMs(rows(base)).toFixed(0)}, new ${meanMs(rows(next)).toFixed(0)}`,
  );
  if (gaps.length) {
    const s = [...gaps].sort((x, y) => x - y);
    console.log(
      `radius gap mm over ${s.length} pairs: median ${quantile(s, 0.5).toFixed(3)}, ` +
        `p90 ${quantile(s, 0.9).toFixed(3)}, max ${s.at(-1)!.toFixed(3)}`,
    );
  }
  console.log(`only one side locked: ${oneSided.length} ${oneSided.slice(0, 10).join(' ')}`);
  console.log(`gate verdict differs: ${gate.length} ${gate.slice(0, 10).join('; ')}`);
  off.sort((x, y) => y[1] - x[1]);
  console.log(`rings differ > ${TOL_MM} mm: ${off.length} ${JSON.stringify(off.slice(0, 10))}`);
  return oneSided.length + gate.length + off.length === 0;
}

const relErr = (got: number | null, ref: number | null): number => {
  const bad = (v: number | null) => v === null || Number.isNaN(v);
  if (bad(got) || bad(ref)) return bad(got) === bad(ref) ? 0 : Infinity;
  return Math.abs(got! - ref!) / Math.max(1, Math.abs(ref!));
};

function holes(base: Map<string, Row>, next: Map<string, Row>): boolean {
  const both = [...base.keys()].filter((k) => next.has(k)).sort();
  const worst = new Map<string, [number, string]>();
  const beyond: string[] = [];
  const oneSided: string[] = [];
  const proposals: string[] = [];
  let candidates = 0;
  const note = (name: string, got: number, ref: number, where: string, tol: number) => {
    const r = relErr(got, ref);
    if (r > (worst.get(name)?.[0] ?? -1)) worst.set(name, [r, where]);
    if (r > tol) beyond.push(`${where} ${name} ${ref} -> ${got}`);
  };
  for (const k of both) {
    const xy = (c: Row) => `${c.x},${c.y}`;
    const a = new Map<string, Row>(base.get(k)!.candidates.map((c: Row) => [xy(c), c]));
    const b = new Map<string, Row>(next.get(k)!.candidates.map((c: Row) => [xy(c), c]));
    for (const p of a.keys()) if (!b.has(p)) oneSided.push(`${k} (${p}) base only`);
    for (const p of b.keys()) if (!a.has(p)) oneSided.push(`${k} (${p}) new only`);
    for (const [p, ca] of a) {
      const cb = b.get(p);
      if (!cb) continue;
      candidates += 1;
      const where = `${k} (${p})`;
      note('resp', cb.resp, ca.resp, where, REL);
      note('probability', cb.p, ca.p, where, REL);
      for (const [name, v] of Object.entries(ca.f as Record<string, number>)) {
        note(name, cb.f[name], v, where, TEXTURE.has(name) ? REL_TEXTURE : REL);
      }
    }
    const pa: Row[] = base.get(k)!.proposals;
    const pb: Row[] = next.get(k)!.proposals;
    const peaks = (ps: Row[]) => ps.map((p) => `${p.peakX},${p.peakY}`).join(' ');
    if (peaks(pa) !== peaks(pb)) {
      proposals.push(`${k} peaks ${peaks(pa)} -> ${peaks(pb)}`);
      continue;
    }
    pa.forEach((p, i) => {
      const q = pb[i]!;
      const where = `${k} (${p.peakX},${p.peakY})`;
      for (const name of ['x', 'y', 'p']) {
        if (relErr(q[name], p[name]) > REL)
          proposals.push(`${where} ${name} ${p[name]} -> ${q[name]}`);
      }
    });
  }
  console.log(`${both.length} canvases, ${candidates} candidates on both sides`);
  for (const [label, m] of [
    ['base', base],
    ['new', next],
  ] as const) {
    const rows = both.map((k) => m.get(k)!);
    console.log(
      `  ${label.padEnd(4)} ms/canvas: candidates ${meanMs(rows, 'msCandidates').toFixed(0)}, ` +
        `proposeHoles ${meanMs(rows, 'msPropose').toFixed(0)}`,
    );
  }
  console.log(
    `candidates on one side only: ${oneSided.length} ${oneSided.slice(0, 10).join('; ')}`,
  );
  console.log('max relative delta (where):');
  for (const [name, [r, where]] of [...worst].sort((x, y) => y[1][0] - x[1][0])) {
    console.log(`  ${name.padEnd(17)} ${r.toExponential(3)}  ${where}`);
  }
  console.log(
    `values beyond tolerance (rel ${REL}, texture ${REL_TEXTURE}): ${beyond.length} ${beyond.slice(0, 10).join('; ')}`,
  );
  console.log(`proposals that differ: ${proposals.length} ${proposals.slice(0, 10).join('; ')}`);
  return oneSided.length + beyond.length + proposals.length === 0;
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { key: { type: 'string', default: 'toMm' } },
  });
  const [kind, basePath, nextPath] = positionals;
  if (!kind || !basePath || !nextPath || !['closeup', 'disc', 'holes'].includes(kind)) {
    console.error('usage: diff.mts closeup|disc|holes <base.jsonl> <new.jsonl> [--key canvasToMm]');
    return 2;
  }
  const base = read(basePath);
  const next = read(nextPath);
  const ok = kind === 'holes' ? holes(base, next) : locks(base, next, kind, values.key);
  const one = [...base.keys()]
    .filter((k) => !next.has(k))
    .concat([...next.keys()].filter((k) => !base.has(k)));
  if (one.length) console.log(`in one file only: ${one.length} ${one.slice(0, 10).join(' ')}`);
  return ok && one.length === 0 ? 0 : 1;
}

process.exitCode = main();
