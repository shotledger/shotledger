// Python's number formatting, so files the tools write diff cleanly against
// the ones the Python spike wrote.
import { pyFixed } from './fit/logistic.mts';

/** A number Python would hold as a float: `pyJson` writes `1.0`, not `1`. */
export class F {
  constructor(readonly v: number) {}
}

/** `json.dumps(value, indent=1)`. A bare number must be an integer; wrap a
 *  float in `F`. */
export function pyJson(value: unknown, level = 0): string {
  const pad = (k: number) => '\n' + ' '.repeat(k);
  if (value === null) return 'null';
  if (value instanceof F) return pyRepr(value.v);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError(`float ${value} not wrapped in F`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => pyJson(v, level + 1));
    return `[${pad(level + 1)}${items.join(`,${pad(level + 1)}`)}${pad(level)}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const items = entries.map(([k, v]) => `${JSON.stringify(k)}: ${pyJson(v, level + 1)}`);
  return `{${pad(level + 1)}${items.join(`,${pad(level + 1)}`)}${pad(level)}}`;
}

/** Python's `round(v, digits)`: half to even on the exact binary value. */
export const pyRound = (v: number, digits: number): number => Number(pyFixed(v, digits));

/** Python's `int(round(v))`. */
export function pyRoundInt(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d !== 0.5) return d < 0.5 ? f : f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Python's `repr(float(v))`: the shortest round-trip digits, `1.0` for an
 *  integer, scientific below 1e-4 and from 1e16. */
export function pyRepr(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  const sign = v < 0 ? '-' : '';
  const [mantissa, exp] = Math.abs(v).toExponential().split('e') as [string, string];
  const digits = mantissa.replace('.', '');
  const e = Number(exp);
  if (e < -4 || e >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${m}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  if (e < 0) return `${sign}0.${'0'.repeat(-e - 1)}${digits}`;
  const whole = digits.slice(0, e + 1).padEnd(e + 1, '0');
  const frac = digits.slice(e + 1);
  return `${sign}${whole}.${frac || '0'}`;
}
