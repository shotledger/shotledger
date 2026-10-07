import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createKeypadState,
  enteredShots,
  pressKey,
  type EntryShot,
  type KeypadKey,
  type ScoringMode,
} from './entry';
import { formatSeriesText, parseSeriesText } from './series-text';

const shot = (valueTenths: number, isInnerTen = false): EntryShot => ({ valueTenths, isInnerTen });

describe('parseSeriesText', () => {
  it('T1 integer series', () => {
    expect(parseSeriesText('10 9 X 10 9', 'integer')).toEqual({
      ok: true,
      shots: [shot(100), shot(90), shot(100, true), shot(100), shot(90)],
    });
  });

  it('T2 whitespace and case', () => {
    expect(parseSeriesText('  10   9\tx ', 'integer')).toEqual({
      ok: true,
      shots: [shot(100), shot(90), shot(100, true)],
    });
    expect(parseSeriesText('', 'integer')).toEqual({ ok: true, shots: [] });
    expect(parseSeriesText('   ', 'decimal')).toEqual({ ok: true, shots: [] });
    expect(parseSeriesText('0 1 2 3 4 5 6 7 8', 'integer')).toEqual({
      ok: true,
      shots: [0, 10, 20, 30, 40, 50, 60, 70, 80].map((value) => shot(value)),
    });
  });

  it.each(['11', '-1', '9.5', 'X10', 'a', '010', '00', 'XX', '10.'])(
    'T3 integer refusals: %s',
    (token) => {
      expect(parseSeriesText(`10 ${token}`, 'integer')).toEqual({
        ok: false,
        error: { kind: 'token', token, position: 2 },
      });
    },
  );

  it('T3 integer refusals: a comma asks for spaces, naming the token', () => {
    expect(parseSeriesText('9 10,9', 'integer')).toEqual({
      ok: false,
      error: { kind: 'comma', token: '10,9', position: 2 },
    });
    expect(parseSeriesText(',', 'integer')).toEqual({
      ok: false,
      error: { kind: 'comma', token: ',', position: 1 },
    });
  });

  it('T3 the first bad token is the one named', () => {
    expect(parseSeriesText('a b', 'integer')).toEqual({
      ok: false,
      error: { kind: 'token', token: 'a', position: 1 },
    });
  });

  it('T4 decimal series', () => {
    expect(parseSeriesText('10.4 9,8 X.6 0.0', 'decimal')).toEqual({
      ok: true,
      shots: [shot(104), shot(98), shot(106, true), shot(0)],
    });
    expect(parseSeriesText('x.0 10.9 1.1', 'decimal')).toEqual({
      ok: true,
      shots: [shot(100, true), shot(109), shot(11)],
    });
  });

  it.each(['10', 'X', '10.10', '11.0', '9.', '.5', 'X10.4', '9..5', '9.5.1', '-1.0', 'a.1', '9,'])(
    'T5 decimal refusals: %s',
    (token) => {
      expect(parseSeriesText(`10.0 ${token}`, 'decimal')).toEqual({
        ok: false,
        error: { kind: 'token', token, position: 2 },
      });
    },
  );
});

const integerShot = fc.oneof(
  fc.integer({ min: 0, max: 10 }).map((ring) => shot(ring * 10)),
  fc.constant(shot(100, true)),
);
const decimalShot = fc
  .record({ ring: fc.integer({ min: 0, max: 10 }), tenth: fc.integer({ min: 0, max: 9 }) })
  .chain(({ ring, tenth }) =>
    (ring === 10 ? fc.boolean() : fc.constant(false)).map((inner) =>
      shot(ring * 10 + tenth, inner),
    ),
  );

describe('formatSeriesText', () => {
  it('writes the keypad spelling', () => {
    expect(formatSeriesText([shot(100), shot(100, true), shot(0)], 'integer')).toBe('10 X 0');
    expect(formatSeriesText([shot(104), shot(106, true), shot(9)], 'decimal')).toBe('10.4 X.6 0.9');
    expect(formatSeriesText([], 'integer')).toBe('');
  });

  it('T6 property: format then parse is the identity', () => {
    for (const [mode, arbitrary] of [
      ['integer', integerShot],
      ['decimal', decimalShot],
    ] as const) {
      fc.assert(
        fc.property(fc.array(arbitrary, { maxLength: 12 }), (shots) => {
          expect(parseSeriesText(formatSeriesText(shots, mode), mode)).toEqual({
            ok: true,
            shots,
          });
        }),
        { numRuns: 500 },
      );
    }
  });
});

// An oracle written independently of the parser: the keypad spelling of one
// shot (C3). Integer: one value key. Decimal: a ring key, a mark, a digit key.
const ORACLE: Record<ScoringMode, RegExp> = {
  integer: /^(?:[0-9]|10|[xX])$/,
  decimal: /^(?:[0-9]|10|[xX])[.,][0-9]$/,
};

function keysSpelledBy(token: string, mode: ScoringMode): KeypadKey[] {
  if (mode === 'integer') return [token.toUpperCase() as KeypadKey];
  const [ring, tenth] = token.toUpperCase().split(/[.,]/);
  return [ring as KeypadKey, tenth as KeypadKey];
}

function keypadReplay(tokens: readonly string[], mode: ScoringMode): readonly EntryShot[] {
  let state = createKeypadState({ mode, seriesLength: Math.max(1, tokens.length) });
  for (const token of tokens) {
    for (const key of keysSpelledBy(token, mode)) state = pressKey(state, key);
  }
  return enteredShots(state);
}

const nearToken = fc.oneof(
  fc.constantFrom('0', '5', '9', '10', 'X', 'x', '10.4', 'X.6', '9,8', '0.0', '10.9', 'x,1'),
  // Near misses, so a parser that accepts one is caught every run.
  fc.constantFrom('11', '010', '00', 'XX', 'X10', '10.10', '11.0', '9.', '.5', '-1', '10,'),
  fc.string({ unit: fc.constantFrom(...'0123456789xX.,-a'), minLength: 1, maxLength: 5 }),
);

describe('parse agrees with the keypad', () => {
  it('T7 property: parse succeeds iff every token spells one keypad shot, with equal shots', () => {
    for (const mode of ['integer', 'decimal'] as const) {
      fc.assert(
        fc.property(fc.array(nearToken, { minLength: 1, maxLength: 8 }), (tokens) => {
          const result = parseSeriesText(tokens.join(' '), mode);
          const allValid = tokens.every((token) => ORACLE[mode].test(token));
          expect(result.ok).toBe(allValid);
          if (result.ok) {
            const replayed = keypadReplay(tokens, mode);
            expect(replayed).toHaveLength(tokens.length);
            expect(result.shots).toEqual(replayed);
          }
        }),
        { numRuns: 1000 },
      );
    }
  });
});
