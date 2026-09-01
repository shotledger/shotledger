// Keypad state machine for score entry — pure, UI-agnostic.
// Executable spec: docs/specs/m3-scoring-spec.md §3, as revised by
// Amendment A2 (maintainer ruling, 2026-09-01, superseding A1 §A1.1): the keys
// are `1`-`9`, `0`, `10` (ORDINARY ten) and `X` (INNER ten / centrumtia), the
// same list in both scoring modes.
//
// One storage for both scoring modes (implementation plan §3): `valueTenths`
// is 0–109, integer mode storing value x 10 and decimal mode storing tenths,
// so every sum stays integer arithmetic.

export type ScoringMode = 'integer' | 'decimal';

export type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'X' | 'backspace';

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export const MAX_VALUE_TENTHS = 109;

export interface EntryShot {
  valueTenths: number;
  /** Centrumtia — set only by the `(X)` key, in either mode. */
  isInnerTen: boolean;
}

/** Decimal mode's half-entered shot: the ring is in, the tenth is not. */
export interface PendingRing {
  ring: number;
  isInnerTen: boolean;
}

export interface KeypadState {
  readonly mode: ScoringMode;
  readonly seriesLength: number;
  readonly shots: readonly (EntryShot | null)[];
  /** Index of the chip being entered; === seriesLength when the series is full. */
  readonly cursor: number;
  readonly pending: PendingRing | null;
}

export interface CreateKeypadStateOptions {
  mode: ScoringMode;
  seriesLength: number;
  shots?: readonly (EntryShot | null)[];
}

/** The single-digit ring keys. `'10'` is a ten key, not a digit — it must not
 * be read as the character '1' followed by '0'. */
function isDigitKey(key: KeypadKey): key is (typeof DIGIT_KEYS)[number] {
  return key.length === 1 && key >= '0' && key <= '9';
}

function firstEmptyIndex(shots: readonly (EntryShot | null)[]): number {
  const index = shots.findIndex((s) => s === null);
  return index === -1 ? shots.length : index;
}

function assertPositiveInteger(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${what} must be a positive integer, got ${value}`);
  }
}

export function createKeypadState(options: CreateKeypadStateOptions): KeypadState {
  const { mode, seriesLength, shots: seed = [] } = options;
  assertPositiveInteger(seriesLength, 'seriesLength');
  if (seed.length > seriesLength) {
    throw new RangeError(`got ${seed.length} shots for a series of ${seriesLength}`);
  }

  const shots: (EntryShot | null)[] = Array.from({ length: seriesLength }, (_, i) => {
    const shot = seed[i] ?? null;
    if (shot === null) return null;
    if (!Number.isInteger(shot.valueTenths) || shot.valueTenths < 0) {
      throw new RangeError(`valueTenths must be an integer 0..${MAX_VALUE_TENTHS}`);
    }
    if (shot.valueTenths > MAX_VALUE_TENTHS) {
      throw new RangeError(`valueTenths must be an integer 0..${MAX_VALUE_TENTHS}`);
    }
    return { ...shot };
  });

  return {
    mode,
    seriesLength,
    shots,
    cursor: firstEmptyIndex(shots),
    pending: null,
  };
}

/**
 * Keys the UI should render (spec B-I7/B-D11). The list is identical in both
 * modes: `10` (ordinary ten) and `X` (centrumtia) are both always offered.
 * `state` is accepted for API stability and future mode-specific key sets.
 */
export function visibleKeys(_state: KeypadState): readonly KeypadKey[] {
  return [...DIGIT_KEYS, '10', 'X', 'backspace'];
}

function withShot(state: KeypadState, index: number, shot: EntryShot | null): KeypadState {
  const shots = state.shots.map((existing, i) => (i === index ? shot : existing));
  return { ...state, shots, pending: null, cursor: firstEmptyIndex(shots) };
}

/** Writes a completed shot at the cursor and moves to the first empty chip. */
function commitShot(state: KeypadState, shot: EntryShot): KeypadState {
  return withShot(state, state.cursor, shot);
}

function pressInteger(state: KeypadState, key: KeypadKey): KeypadState {
  if (isDigitKey(key)) {
    return commitShot(state, { valueTenths: Number(key) * 10, isInnerTen: false });
  }
  // Both ten keys are worth 10 points; only 'X' marks the centrumtia.
  return commitShot(state, { valueTenths: 100, isInnerTen: key === 'X' });
}

function pressDecimal(state: KeypadState, key: KeypadKey): KeypadState {
  const { pending } = state;

  if (pending === null) {
    if (isDigitKey(key)) {
      return { ...state, pending: { ring: Number(key), isInnerTen: false } };
    }
    // Ring 10 either way; 'X' additionally marks the centrumtia.
    return { ...state, pending: { ring: 10, isInnerTen: key === 'X' } };
  }

  // Second tap: only a digit completes the shot (spec B-D8).
  if (!isDigitKey(key)) return state;
  return commitShot(state, {
    valueTenths: pending.ring * 10 + Number(key),
    isInnerTen: pending.isInnerTen,
  });
}

function pressBackspace(state: KeypadState): KeypadState {
  // Decimal mid-entry: undo the ring tap only (spec D9).
  if (state.pending !== null) return { ...state, pending: null };

  // Cursor parked on a filled chip (an edit selection): clear it in place.
  if (state.cursor < state.seriesLength && state.shots[state.cursor] !== null) {
    return withShot(state, state.cursor, null);
  }

  // Otherwise step back onto the previous chip and clear it.
  if (state.cursor === 0) return state;
  return withShot(state, state.cursor - 1, null);
}

/** Applies one key press. Pure: the input state is never mutated. */
export function pressKey(state: KeypadState, key: KeypadKey): KeypadState {
  if (key === 'backspace') return pressBackspace(state);
  // A full series accepts no new values; edit by selecting a chip first.
  if (state.cursor >= state.seriesLength) return state;
  return state.mode === 'integer' ? pressInteger(state, key) : pressDecimal(state, key);
}

/** Re-selects a chip for editing; the next value key overwrites it (spec E1). */
export function selectShot(state: KeypadState, index: number): KeypadState {
  if (!Number.isInteger(index) || index < 0 || index >= state.seriesLength) {
    throw new RangeError(`shot index ${index} is outside 0..${state.seriesLength - 1}`);
  }
  return { ...state, cursor: index, pending: null };
}

/** Completed shots, in chip order — what gets persisted. */
export function enteredShots(state: KeypadState): readonly EntryShot[] {
  return state.shots.filter((shot): shot is EntryShot => shot !== null);
}

/** Running series total in tenths; a half-entered decimal shot counts 0. */
export function seriesTotalTenths(state: KeypadState): number {
  return enteredShots(state).reduce((sum, shot) => sum + shot.valueTenths, 0);
}

export function isSeriesComplete(state: KeypadState): boolean {
  return enteredShots(state).length === state.seriesLength;
}
