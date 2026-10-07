// Keyboard series entry for the web (docs/specs/web-series-entry-spec.md C3).
// Each token is spelled out as the phone keypad's key presses and run through
// `pressKey`, so typed text stores exactly what the keypad would.
import { createKeypadState, enteredShots, pressKey } from './entry';
import type { EntryShot, KeypadKey, ScoringMode } from './entry';

export type SeriesTextError =
  /** `position` is the token's 1-based place in the text. */
  | { kind: 'token'; token: string; position: number }
  /** Integer mode only: shots are separated by spaces, not commas. */
  | { kind: 'comma'; token: string; position: number };

export type SeriesTextResult =
  { ok: true; shots: EntryShot[] } | { ok: false; error: SeriesTextError };

const RING = '(10|[0-9]|X)';
const INTEGER_TOKEN = new RegExp(`^${RING}$`);
const DECIMAL_TOKEN = new RegExp(`^${RING}[.,]([0-9])$`);

/** The keys a token spells, or null when it spells no single shot. */
function keysFor(token: string, mode: ScoringMode): KeypadKey[] | null {
  const upper = token.toUpperCase();
  if (mode === 'integer') {
    return INTEGER_TOKEN.test(upper) ? [upper as KeypadKey] : null;
  }
  const match = DECIMAL_TOKEN.exec(upper);
  return match ? [match[1] as KeypadKey, match[2] as KeypadKey] : null;
}

export function parseSeriesText(text: string, mode: ScoringMode): SeriesTextResult {
  const tokens = text.match(/\S+/g) ?? [];
  const shots: EntryShot[] = [];
  for (const [index, token] of tokens.entries()) {
    const keys = keysFor(token, mode);
    if (keys === null) {
      const kind = mode === 'integer' && token.includes(',') ? 'comma' : 'token';
      return { ok: false, error: { kind, token, position: index + 1 } };
    }
    const state = keys.reduce(pressKey, createKeypadState({ mode, seriesLength: 1 }));
    shots.push(...enteredShots(state));
  }
  return { ok: true, shots };
}

/** The text that parses back to `shots`: the keypad spelling, space separated. */
export function formatSeriesText(shots: readonly EntryShot[], mode: ScoringMode): string {
  return shots
    .map(({ valueTenths, isInnerTen }) => {
      if (mode === 'integer') return isInnerTen ? 'X' : String(valueTenths / 10);
      const ring = isInnerTen ? 'X' : String(Math.floor(valueTenths / 10));
      return `${ring}.${valueTenths % 10}`;
    })
    .join(' ');
}
