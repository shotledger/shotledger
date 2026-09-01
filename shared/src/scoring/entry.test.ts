// Executable spec for docs/specs/m3-scoring-spec.md §3 (keypad state machine).
// Scenario ids (I1, D4, E5, C2, P1 …) map 1:1 to the spec tables.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createKeypadState,
  enteredShots,
  isSeriesComplete,
  pressKey,
  selectShot,
  seriesTotalTenths,
  visibleKeys,
  type EntryShot,
  type KeypadKey,
  type KeypadState,
  type ScoringMode,
} from './entry';

function integerState(seriesLength = 5): KeypadState {
  return createKeypadState({ mode: 'integer', seriesLength });
}

function decimalState(seriesLength = 10, innerTenDecimalEnabled = false): KeypadState {
  return createKeypadState({ mode: 'decimal', seriesLength, innerTenDecimalEnabled });
}

function press(state: KeypadState, ...keys: readonly KeypadKey[]): KeypadState {
  return keys.reduce(pressKey, state);
}

const shot = (valueTenths: number, isInnerTen = false, isInnerTenDecimal = false): EntryShot => ({
  valueTenths,
  isInnerTen,
  isInnerTenDecimal,
});

describe('integer mode (spec §3.3)', () => {
  it('I1: a digit key enters one shot worth digit x 10', () => {
    const state = press(integerState(), '9');
    expect(state.shots[0]).toEqual(shot(90));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(90);
  });

  it('I2: 0 enters a miss', () => {
    const state = press(integerState(), '0');
    expect(state.shots[0]).toEqual(shot(0));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(0);
  });

  it('I3: X enters 10 with the inner-ten flag', () => {
    const state = press(integerState(), 'X');
    expect(state.shots[0]).toEqual(shot(100, true));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(100);
  });

  it('I4: (X) is not a key in integer mode and is ignored', () => {
    const before = integerState();
    const after = pressKey(before, '(X)');
    expect(after).toEqual(before);
  });

  it('I5: a full 5-shot series sums and counts inner tens', () => {
    const state = press(integerState(), '9', '0', '8', '7', 'X');
    expect(state.shots.map((s) => s?.valueTenths)).toEqual([90, 0, 80, 70, 100]);
    expect(seriesTotalTenths(state)).toBe(340);
    expect(enteredShots(state).filter((s) => s.isInnerTen)).toHaveLength(1);
    expect(isSeriesComplete(state)).toBe(true);
  });

  it('I5b: the spec example 9,10,8,7,X totals 440 tenths', () => {
    const state = press(integerState(), '9', 'X', '8', '7', 'X');
    expect(seriesTotalTenths(state)).toBe(440);
  });

  it('I6: keys are ignored once the series is full', () => {
    const full = press(integerState(), '9', '9', '9', '9', '9');
    expect(pressKey(full, '7')).toEqual(full);
    expect(full.cursor).toBe(5);
  });

  it('I7: visibleKeys omits (X) in integer mode', () => {
    expect(visibleKeys(integerState())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      'X',
      'backspace',
    ]);
  });
});

describe('decimal mode (spec §3.4)', () => {
  it('D1: ring 1 then tenth 0 is 1.0', () => {
    const state = press(decimalState(), '1', '0');
    expect(state.shots[0]).toEqual(shot(10));
    expect(state.cursor).toBe(1);
  });

  it('D2: ring 9 then tenth 7 is 9.7', () => {
    expect(press(decimalState(), '9', '7').shots[0]).toEqual(shot(97));
  });

  it('D3: ring 0 then tenth 0 is a miss', () => {
    expect(press(decimalState(), '0', '0').shots[0]).toEqual(shot(0));
  });

  it('D4: X then 9 is 10.9 with the inner-ten flag', () => {
    expect(press(decimalState(), 'X', '9').shots[0]).toEqual(shot(109, true));
  });

  it('D5: X then 3 is 10.3 with the inner-ten flag (not clamped)', () => {
    expect(press(decimalState(), 'X', '3').shots[0]).toEqual(shot(103, true));
  });

  it('D6: (X) then 9 sets is_inner_ten_decimal when the flag is enabled', () => {
    const state = press(decimalState(10, true), '(X)', '9');
    expect(state.shots[0]).toEqual(shot(109, false, true));
  });

  it('D7: (X) is ignored and hidden when the flag is off', () => {
    const before = decimalState();
    expect(pressKey(before, '(X)')).toEqual(before);
    expect(visibleKeys(before)).not.toContain('(X)');
  });

  it('D8: X and (X) are ignored while a ring is pending', () => {
    const pending = press(decimalState(10, true), '9');
    expect(pressKey(pending, 'X')).toEqual(pending);
    expect(pressKey(pending, '(X)')).toEqual(pending);
  });

  it('D9: backspace clears a pending ring without writing a shot', () => {
    const pending = press(decimalState(), '9');
    expect(pending.pending).not.toBeNull();
    const cleared = pressKey(pending, 'backspace');
    expect(cleared.pending).toBeNull();
    expect(cleared.shots[0]).toBeNull();
    expect(cleared.cursor).toBe(0);
  });

  it('D10: a half-entered shot contributes nothing to the running total', () => {
    const state = press(decimalState(), '9', '7', '8');
    expect(seriesTotalTenths(state)).toBe(97);
    expect(enteredShots(state)).toHaveLength(1);
  });

  it('D11: visibleKeys includes (X) when the flag is enabled', () => {
    expect(visibleKeys(decimalState(10, true))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      'X',
      '(X)',
      'backspace',
    ]);
  });
});

describe('editing and backspace (spec §3.6)', () => {
  it('E1: selectShot re-selects a chip and clears any pending ring', () => {
    const state = press(decimalState(5), '9', '7', '8', '6', '7', '5', '3');
    const selected = selectShot(state, 1);
    expect(selected.cursor).toBe(1);
    expect(selected.pending).toBeNull();
    expect(selected.shots).toEqual(state.shots);
  });

  it('E2: entering over a selected chip overwrites it and returns to the first empty chip', () => {
    const state = press(integerState(), '9', '8', '7');
    const edited = pressKey(selectShot(state, 1), '5');
    expect(edited.shots.map((s) => s?.valueTenths ?? null)).toEqual([90, 50, 70, null, null]);
    expect(edited.cursor).toBe(3);
  });

  it('E3: editing a full series leaves the cursor past the end', () => {
    const full = press(integerState(), '9', '8', '7', '6', '5');
    const edited = pressKey(selectShot(full, 0), '8');
    expect(edited.shots[0]).toEqual(shot(80));
    expect(edited.cursor).toBe(5);
    expect(isSeriesComplete(edited)).toBe(true);
  });

  it('E4: backspace on an empty cursor clears and selects the previous chip', () => {
    const state = press(integerState(), '9', '8', '7');
    const back = pressKey(state, 'backspace');
    expect(back.shots.map((s) => s?.valueTenths ?? null)).toEqual([90, 80, null, null, null]);
    expect(back.cursor).toBe(2);
  });

  it('E5: backspace on a selected filled chip clears that chip in place', () => {
    const state = press(integerState(), '9', '8', '7');
    const back = pressKey(selectShot(state, 1), 'backspace');
    expect(back.shots.map((s) => s?.valueTenths ?? null)).toEqual([90, null, 70, null, null]);
    expect(back.cursor).toBe(1);
  });

  it('E6: backspace on an empty series is a no-op', () => {
    const before = integerState();
    expect(pressKey(before, 'backspace')).toEqual(before);
  });

  it('E7: selectShot rejects out-of-range indices', () => {
    const state = integerState();
    expect(() => selectShot(state, -1)).toThrow(RangeError);
    expect(() => selectShot(state, 5)).toThrow(RangeError);
    expect(() => selectShot(state, 1.5)).toThrow(RangeError);
  });

  it('E8: after refilling a gap the cursor lands past the last shot', () => {
    const state = press(integerState(), '9', '8', '7', '6', '5');
    const gapped = pressKey(selectShot(state, 2), 'backspace');
    expect(gapped.cursor).toBe(2);
    const refilled = pressKey(gapped, '4');
    expect(refilled.cursor).toBe(5);
    expect(refilled.shots.map((s) => s?.valueTenths)).toEqual([90, 80, 40, 60, 50]);
  });
});

describe('construction (spec §3.7)', () => {
  it('C1/C2: series length must be a positive integer', () => {
    expect(() => createKeypadState({ mode: 'integer', seriesLength: 0 })).toThrow(RangeError);
    expect(() => createKeypadState({ mode: 'integer', seriesLength: -1 })).toThrow(RangeError);
    expect(() => createKeypadState({ mode: 'integer', seriesLength: 2.5 })).toThrow(RangeError);
  });

  it('C3: seeded shots are editable and the cursor starts at the first empty chip', () => {
    const state = createKeypadState({
      mode: 'integer',
      seriesLength: 5,
      shots: [shot(90), shot(100, true), null],
    });
    expect(state.shots).toHaveLength(5);
    expect(state.cursor).toBe(2);
    expect(seriesTotalTenths(state)).toBe(190);
  });

  it('C3b: a fully seeded series starts with the cursor past the end', () => {
    const state = createKeypadState({
      mode: 'integer',
      seriesLength: 2,
      shots: [shot(90), shot(80)],
    });
    expect(state.cursor).toBe(2);
    expect(isSeriesComplete(state)).toBe(true);
  });

  it('C4: more seeded shots than the series length is rejected', () => {
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 1, shots: [shot(90), shot(80)] }),
    ).toThrow(RangeError);
  });

  it('C5: seeded shot values outside 0-109 are rejected', () => {
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 2, shots: [shot(110)] }),
    ).toThrow(RangeError);
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 2, shots: [shot(-1)] }),
    ).toThrow(RangeError);
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 2, shots: [shot(90.5)] }),
    ).toThrow(RangeError);
  });

  it('C6: pressKey does not mutate its input state', () => {
    const before = integerState();
    const snapshot = structuredClone(before);
    pressKey(before, '9');
    expect(before).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Properties (spec §3.8). fast-check drives arbitrary key sequences through the
// machine and checks the invariants that must hold for every reachable state.
// ---------------------------------------------------------------------------

const anyKey = fc.constantFrom<KeypadKey>(
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'X',
  '(X)',
  'backspace',
);

const anyMode = fc.constantFrom<ScoringMode>('integer', 'decimal');

function firstEmptyIndex(state: KeypadState): number {
  const index = state.shots.findIndex((s) => s === null);
  return index === -1 ? state.seriesLength : index;
}

describe('properties (spec §3.8)', () => {
  it('P1: every entered shot stays an integer in 0..109', () => {
    fc.assert(
      fc.property(anyMode, fc.integer({ min: 1, max: 8 }), fc.array(anyKey), (mode, len, keys) => {
        const state = press(
          createKeypadState({ mode, seriesLength: len, innerTenDecimalEnabled: true }),
          ...keys,
        );
        for (const s of enteredShots(state)) {
          expect(Number.isInteger(s.valueTenths)).toBe(true);
          expect(s.valueTenths).toBeGreaterThanOrEqual(0);
          expect(s.valueTenths).toBeLessThanOrEqual(109);
        }
      }),
    );
  });

  it('P2: the running total equals the sum of entered shots', () => {
    fc.assert(
      fc.property(anyMode, fc.integer({ min: 1, max: 8 }), fc.array(anyKey), (mode, len, keys) => {
        const state = press(
          createKeypadState({ mode, seriesLength: len, innerTenDecimalEnabled: true }),
          ...keys,
        );
        const expected = enteredShots(state).reduce((sum, s) => sum + s.valueTenths, 0);
        expect(seriesTotalTenths(state)).toBe(expected);
      }),
    );
  });

  it('P3: the cursor is always the first empty chip (or the end)', () => {
    fc.assert(
      fc.property(anyMode, fc.integer({ min: 1, max: 8 }), fc.array(anyKey), (mode, len, keys) => {
        let state = createKeypadState({ mode, seriesLength: len, innerTenDecimalEnabled: true });
        for (const key of keys) {
          state = pressKey(state, key);
          // backspace deliberately parks the cursor on the chip it cleared,
          // which is by construction the first empty chip from there on.
          expect(state.cursor).toBe(firstEmptyIndex(state));
          expect(state.shots).toHaveLength(len);
          expect(enteredShots(state).length).toBeLessThanOrEqual(len);
        }
      }),
    );
  });

  it('P4: typing digits equals seeding the same shots directly (integer mode)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
        (digits) => {
          const typed = press(
            createKeypadState({ mode: 'integer', seriesLength: 5 }),
            ...digits.map((d) => String(d) as KeypadKey),
          );
          const seeded = createKeypadState({
            mode: 'integer',
            seriesLength: 5,
            shots: digits.map((d) => shot(d * 10)),
          });
          expect(typed).toEqual(seeded);
        },
      ),
    );
  });

  it('P5: pressKey never mutates its input', () => {
    fc.assert(
      fc.property(anyMode, fc.array(anyKey), anyKey, (mode, keys, next) => {
        const state = press(
          createKeypadState({ mode, seriesLength: 5, innerTenDecimalEnabled: true }),
          ...keys,
        );
        const snapshot = structuredClone(state);
        pressKey(state, next);
        expect(state).toEqual(snapshot);
      }),
    );
  });
});
