// Executable spec for docs/specs/m3-scoring-spec.md §3 (keypad state machine)
// as revised by Amendment A1 §A1.1: `X` is an ordinary ten, `(X)` is the inner
// ten (centrumtia), both usable in both modes.
// Scenario ids (A-I1, A-D4, E5, C2, P1 …) map 1:1 to the spec tables.
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

function decimalState(seriesLength = 10): KeypadState {
  return createKeypadState({ mode: 'decimal', seriesLength });
}

function press(state: KeypadState, ...keys: readonly KeypadKey[]): KeypadState {
  return keys.reduce(pressKey, state);
}

const shot = (valueTenths: number, isInnerTen = false): EntryShot => ({
  valueTenths,
  isInnerTen,
});

describe('integer mode (spec §A1.1.3, replaces §3.3)', () => {
  it('A-I1: a digit key enters one shot worth digit x 10', () => {
    const state = press(integerState(), '9');
    expect(state.shots[0]).toEqual(shot(90));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(90);
  });

  it('A-I2: 0 enters a miss', () => {
    const state = press(integerState(), '0');
    expect(state.shots[0]).toEqual(shot(0));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(0);
  });

  it('A-I3: X enters an ORDINARY ten — no inner-ten flag', () => {
    const state = press(integerState(), 'X');
    expect(state.shots[0]).toEqual(shot(100, false));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(100);
  });

  it('A-I4: (X) enters an INNER ten (centrumtia) worth the same 10 points', () => {
    const state = press(integerState(), '(X)');
    expect(state.shots[0]).toEqual(shot(100, true));
    expect(state.cursor).toBe(1);
    expect(seriesTotalTenths(state)).toBe(100);
  });

  it('A-I5: a full 5-shot series sums and counts only (X) as an inner ten', () => {
    const state = press(integerState(), '9', 'X', '8', '7', '(X)');
    expect(state.shots.map((s) => s?.valueTenths)).toEqual([90, 100, 80, 70, 100]);
    expect(seriesTotalTenths(state)).toBe(440);
    expect(enteredShots(state).filter((s) => s.isInnerTen)).toHaveLength(1);
    expect(isSeriesComplete(state)).toBe(true);
  });

  it('A-I5b: a series of five plain X keys scores 50 with zero inner tens', () => {
    const state = press(integerState(), 'X', 'X', 'X', 'X', 'X');
    expect(seriesTotalTenths(state)).toBe(500);
    expect(enteredShots(state).filter((s) => s.isInnerTen)).toHaveLength(0);
  });

  it('A-I6: keys are ignored once the series is full', () => {
    const full = press(integerState(), '9', '9', '9', '9', '9');
    expect(pressKey(full, '7')).toEqual(full);
    expect(pressKey(full, '(X)')).toEqual(full);
    expect(full.cursor).toBe(5);
  });

  it('A-I7: visibleKeys includes (X) in integer mode', () => {
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
      '(X)',
      'backspace',
    ]);
  });
});

describe('decimal mode (spec §A1.1.3, replaces §3.4)', () => {
  it('A-D1: ring 1 then tenth 0 is 1.0', () => {
    const state = press(decimalState(), '1', '0');
    expect(state.shots[0]).toEqual(shot(10));
    expect(state.cursor).toBe(1);
  });

  it('A-D2: ring 9 then tenth 7 is 9.7', () => {
    expect(press(decimalState(), '9', '7').shots[0]).toEqual(shot(97));
  });

  it('A-D3: ring 0 then tenth 0 is a miss', () => {
    expect(press(decimalState(), '0', '0').shots[0]).toEqual(shot(0));
  });

  it('A-D4: X then 9 is 10.9 with NO inner-ten flag', () => {
    expect(press(decimalState(), 'X', '9').shots[0]).toEqual(shot(109, false));
  });

  it('A-D5: X then 3 is 10.3, no inner-ten flag (not clamped)', () => {
    expect(press(decimalState(), 'X', '3').shots[0]).toEqual(shot(103, false));
  });

  it('A-D6: (X) then 9 is 10.9 WITH the inner-ten flag', () => {
    expect(press(decimalState(), '(X)', '9').shots[0]).toEqual(shot(109, true));
  });

  it('A-D7: (X) then 3 is 10.3 with the inner-ten flag (not clamped)', () => {
    expect(press(decimalState(), '(X)', '3').shots[0]).toEqual(shot(103, true));
  });

  it('A-D8: X and (X) are ignored while a ring is pending', () => {
    const pending = press(decimalState(), '9');
    expect(pressKey(pending, 'X')).toEqual(pending);
    expect(pressKey(pending, '(X)')).toEqual(pending);
  });

  it('A-D9: backspace clears a pending ring without writing a shot', () => {
    const pending = press(decimalState(), '9');
    expect(pending.pending).not.toBeNull();
    const cleared = pressKey(pending, 'backspace');
    expect(cleared.pending).toBeNull();
    expect(cleared.shots[0]).toBeNull();
    expect(cleared.cursor).toBe(0);
  });

  it('A-D9b: backspace clears a pending (X) ring too, losing the inner-ten mark', () => {
    const pending = press(decimalState(), '(X)');
    expect(pending.pending).toEqual({ ring: 10, isInnerTen: true });
    expect(pressKey(pending, 'backspace').pending).toBeNull();
  });

  it('A-D10: a half-entered shot contributes nothing to the running total', () => {
    const state = press(decimalState(), '9', '7', '8');
    expect(seriesTotalTenths(state)).toBe(97);
    expect(enteredShots(state)).toHaveLength(1);
  });

  it('A-D11: visibleKeys is the same list in decimal mode as in integer mode', () => {
    expect(visibleKeys(decimalState())).toEqual(visibleKeys(integerState()));
    expect(visibleKeys(decimalState())).toContain('(X)');
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
        const state = press(createKeypadState({ mode, seriesLength: len }), ...keys);
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
        const state = press(createKeypadState({ mode, seriesLength: len }), ...keys);
        const expected = enteredShots(state).reduce((sum, s) => sum + s.valueTenths, 0);
        expect(seriesTotalTenths(state)).toBe(expected);
      }),
    );
  });

  it('P3: the cursor is always the first empty chip (or the end)', () => {
    fc.assert(
      fc.property(anyMode, fc.integer({ min: 1, max: 8 }), fc.array(anyKey), (mode, len, keys) => {
        let state = createKeypadState({ mode, seriesLength: len });
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

  it('A-P6: isInnerTen is set only by (X), and always on a ten', () => {
    fc.assert(
      fc.property(anyMode, fc.integer({ min: 1, max: 8 }), fc.array(anyKey), (mode, len, keys) => {
        const state = press(createKeypadState({ mode, seriesLength: len }), ...keys);
        const innerTenCount = enteredShots(state).filter((s) => s.isInnerTen).length;
        for (const s of enteredShots(state)) {
          if (s.isInnerTen) expect(s.valueTenths).toBeGreaterThanOrEqual(100);
        }
        // Never more inner tens than (X) presses that could have produced them.
        expect(innerTenCount).toBeLessThanOrEqual(keys.filter((k) => k === '(X)').length);
      }),
    );
  });

  it('P5: pressKey never mutates its input', () => {
    fc.assert(
      fc.property(anyMode, fc.array(anyKey), anyKey, (mode, keys, next) => {
        const state = press(createKeypadState({ mode, seriesLength: 5 }), ...keys);
        const snapshot = structuredClone(state);
        pressKey(state, next);
        expect(state).toEqual(snapshot);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Gaps found by mutation testing (Stryker survivors). Each test below exists
// because a plausible bug in entry.ts went unnoticed by the tests above.
// ---------------------------------------------------------------------------

describe('mutation-hardening', () => {
  it('rejects bad construction with a message that says what is wrong', () => {
    expect(() => createKeypadState({ mode: 'integer', seriesLength: 0 })).toThrow(
      /seriesLength must be a positive integer, got 0/,
    );
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 1, shots: [shot(90), shot(80)] }),
    ).toThrow(/got 2 shots for a series of 1/);
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 1, shots: [shot(110)] }),
    ).toThrow(/valueTenths must be an integer 0\.\.109/);
    expect(() =>
      createKeypadState({ mode: 'integer', seriesLength: 1, shots: [shot(-1)] }),
    ).toThrow(/valueTenths must be an integer 0\.\.109/);
    expect(() => selectShot(integerState(3), 7)).toThrow(/shot index 7 is outside 0\.\.2/);
  });

  it('accepts the boundary values 0 and 109 when seeding', () => {
    const state = createKeypadState({
      mode: 'decimal',
      seriesLength: 2,
      shots: [shot(0), shot(109, true)],
    });
    expect(seriesTotalTenths(state)).toBe(109);
  });

  it('X and (X) differ only by the inner-ten flag, never by value', () => {
    const plain = press(integerState(), 'X').shots[0]!;
    const inner = press(integerState(), '(X)').shots[0]!;
    expect(plain.valueTenths).toBe(inner.valueTenths);
    expect(plain.isInnerTen).toBe(false);
    expect(inner.isInnerTen).toBe(true);
  });

  it('the decimal pending ring carries the inner-ten mark from (X) only', () => {
    expect(press(decimalState(), 'X').pending).toEqual({ ring: 10, isInnerTen: false });
    expect(press(decimalState(), '(X)').pending).toEqual({ ring: 10, isInnerTen: true });
  });

  it('backspace on a full series clears the last chip', () => {
    const full = press(integerState(), '9', '8', '7', '6', '5');
    const back = pressKey(full, 'backspace');
    expect(back.shots.map((s) => s?.valueTenths ?? null)).toEqual([90, 80, 70, 60, null]);
    expect(back.cursor).toBe(4);
  });

  it('a full series ignores a decimal ring tap too', () => {
    const full = press(decimalState(2), '9', '7', '8', '6');
    expect(isSeriesComplete(full)).toBe(true);
    expect(pressKey(full, '9')).toEqual(full);
    expect(full.pending).toBeNull();
  });

  it('a partially filled series is not complete', () => {
    expect(isSeriesComplete(press(integerState(), '9', '8'))).toBe(false);
    expect(isSeriesComplete(integerState())).toBe(false);
  });
});
