// Resolving a bullet diameter for the mark disc.
// Spec: docs/specs/photo-scoring-phase1-spec.md §6.
//
// `firearms.caliber` and `ammo_lots.caliber` now hold a caliber from
// `shared/src/calibers` (".22 LR", "9×19 mm", …), but the vocabulary is much
// wider than the five bullet diameters the disc needs, and pre-presets rows
// can still hold anything — so a caliber is matched here, not looked up. An
// unmatched string is NOT an error: it falls back to .22 and tells the caller
// it guessed, so the UI can offer the picker instead of silently scoring with
// the wrong disc.
import { CALIBER_MM } from '@shotledger/shared';

/** Presets offered in the fallback picker, in the order they are shown. */
export const CALIBER_KEYS = ['.22', '9mm', '.32', '.38', '.45'] as const;
export type CaliberKey = (typeof CALIBER_KEYS)[number];

/** .22 LR — `BULLET_MM` in the CV spike, and the only caliber the corpus has. */
export const DEFAULT_CALIBER_KEY: CaliberKey = '.22';

export interface ResolvedCaliber {
  readonly key: CaliberKey;
  readonly caliberMm: number;
  /** false when nothing matched and the default was assumed. */
  readonly matched: boolean;
}

// Guarded on both sides, because a caliber designation is a whole token:
//  - the LEADING guard is start-of-string or a separator, never a digit or an
//    'x'. Without it "7.62x38R" reads as a .38 and "7.62x39" as a 9mm.
//  - the TRAILING guard is not-a-digit, so ".223" is not a .22 and ".380" is
//    not a .38.
const LEAD = String.raw`(^|[\s(,\-/])`;
const PATTERNS: readonly (readonly [RegExp, CaliberKey])[] = [
  [new RegExp(`${LEAD}\\.?22(lr|l|$|[^\\d])`), '.22'],
  [new RegExp(`${LEAD}9\\s*(mm|x19|×19)($|[^\\d])`), '9mm'],
  [new RegExp(`${LEAD}9($|[^\\d.])`), '9mm'],
  [new RegExp(`${LEAD}\\.?32($|[^\\d])`), '.32'],
  [new RegExp(`${LEAD}7[.,]65($|[^\\d])`), '.32'],
  [new RegExp(`${LEAD}\\.?38($|[^\\d])`), '.38'],
  [new RegExp(`${LEAD}\\.?45($|[^\\d])`), '.45'],
];

function matchKey(text: string): CaliberKey | null {
  const normalised = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalised) return null;
  for (const [pattern, key] of PATTERNS) {
    if (pattern.test(normalised)) return key;
  }
  return null;
}

export function caliberMmFor(key: CaliberKey): number {
  // CALIBER_KEYS is a subset of CALIBER_MM's keys by construction.
  return CALIBER_MM[key] as number;
}

/**
 * Takes the candidates in priority order — the session's firearm caliber
 * first, then its ammo lot — and returns the first that matches.
 */
export function resolveCaliber(
  ...candidates: readonly (string | null | undefined)[]
): ResolvedCaliber {
  for (const candidate of candidates) {
    const key = candidate ? matchKey(candidate) : null;
    if (key) return { key, caliberMm: caliberMmFor(key), matched: true };
  }
  return {
    key: DEFAULT_CALIBER_KEY,
    caliberMm: caliberMmFor(DEFAULT_CALIBER_KEY),
    matched: false,
  };
}
