import { SPSF_PISTOL_25M_PRECISION as TARGET } from '@shotledger/shared';

import type { Mark, MarkState } from './marks';
import {
  canAddMark,
  createMarkState,
  markReducer,
  marksToShotMarkInputs,
  scoreMarks,
  seriesScoreLine,
} from './marks';

const start = (patch: Partial<MarkState> = {}): MarkState => ({
  ...createMarkState({ maxMarks: 5, caliberMm: 5.6 }),
  ...patch,
});

const tap = (state: MarkState, id: string, xMm: number, yMm: number) =>
  markReducer(state, { type: 'tap', id, xMm, yMm });

describe('markReducer', () => {
  it('a tap places a caliber-sized mark and selects it', () => {
    const state = tap(start(), 'a', 10, -20);
    expect(state.marks).toHaveLength(1);
    expect(state.marks[0]).toMatchObject({
      id: 'a',
      xMm: 10,
      yMm: -20,
      caliberMm: 5.6,
      isInnerTen: false,
      calledRingLabel: null,
    });
    expect(state.selectedId).toBe('a');
  });

  it('refuses a tap past the series length cap', () => {
    let state = start({ maxMarks: 2 });
    state = tap(state, 'a', 0, 0);
    state = tap(state, 'b', 1, 1);
    expect(canAddMark(state)).toBe(false);

    const refused = tap(state, 'c', 2, 2);
    expect(refused).toBe(state);
    expect(refused.marks).toHaveLength(2);
  });

  it('selects an existing mark and ignores an unknown id', () => {
    const state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    expect(markReducer(state, { type: 'select', id: 'a' }).selectedId).toBe('a');
    expect(markReducer(state, { type: 'select', id: 'nope' })).toBe(state);
  });

  it('moves the selected mark only', () => {
    let state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    state = markReducer(state, { type: 'select', id: 'a' });
    state = markReducer(state, { type: 'move', xMm: 30, yMm: 40 });
    expect(state.marks[0]).toMatchObject({ id: 'a', xMm: 30, yMm: 40 });
    expect(state.marks[1]).toMatchObject({ id: 'b', xMm: 5, yMm: 5 });
  });

  it('moving clears a previous edge call, which was made for the old position', () => {
    let state = tap(start(), 'a', 15.3, 0);
    state = markReducer(state, { type: 'callRing', ringLabel: '10' });
    expect(state.marks[0]?.calledRingLabel).toBe('10');

    state = markReducer(state, { type: 'move', xMm: 60, yMm: 0 });
    expect(state.marks[0]?.calledRingLabel).toBeNull();
  });

  it('deletes the selected mark and clears the selection', () => {
    let state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    state = markReducer(state, { type: 'select', id: 'a' });
    state = markReducer(state, { type: 'delete' });
    expect(state.marks.map((m) => m.id)).toEqual(['b']);
    expect(state.selectedId).toBeNull();
  });

  it('ignores move/delete/toggle with nothing selected', () => {
    const state = markReducer(tap(start(), 'a', 0, 0), { type: 'deselect' });
    expect(markReducer(state, { type: 'move', xMm: 9, yMm: 9 })).toBe(state);
    expect(markReducer(state, { type: 'delete' })).toBe(state);
    expect(markReducer(state, { type: 'toggleInnerTen' })).toBe(state);
  });

  it('toggles the X call on the selected mark', () => {
    let state = tap(start(), 'a', 0, 0);
    state = markReducer(state, { type: 'toggleInnerTen' });
    expect(state.marks[0]?.isInnerTen).toBe(true);
    state = markReducer(state, { type: 'toggleInnerTen' });
    expect(state.marks[0]?.isInnerTen).toBe(false);
  });

  it('changing the caliber re-sizes every existing disc', () => {
    let state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    state = markReducer(state, { type: 'setCaliber', caliberMm: 9 });
    expect(state.caliberMm).toBe(9);
    expect(state.marks.map((m) => m.caliberMm)).toEqual([9, 9]);
    // and a new mark gets the new caliber too
    expect(tap(state, 'c', 1, 1).marks[2]?.caliberMm).toBe(9);
  });

  it('clear removes every mark', () => {
    const state = markReducer(tap(tap(start(), 'a', 0, 0), 'b', 5, 5), { type: 'clear' });
    expect(state.marks).toEqual([]);
    expect(state.selectedId).toBeNull();
  });
});

const mark = (patch: Partial<Mark>): Mark => ({
  id: 'm',
  xMm: 0,
  yMm: 0,
  caliberMm: 5.6,
  isInnerTen: false,
  calledRingLabel: null,
  moved: false,
  ...patch,
});

describe('scoreMarks', () => {
  it('scores a centered hole as the X ring', () => {
    const [score] = scoreMarks([mark({})], TARGET);
    expect(score?.computed.ringLabel).toBe('X');
    expect(score?.effective.value).toBe(10);
  });

  it('flags an edge call and offers the two rings in dispute, higher first', () => {
    // X ring radius 12.5mm; near edge = r - 2.8. A center at 15.3mm puts the
    // near edge exactly on the X ring, so it scores X with a 0mm margin.
    const [score] = scoreMarks([mark({ xMm: 15.3 })], TARGET);
    expect(score?.computed.edgeCall).toBe(true);
    expect(score?.computed.ringLabel).toBe('X');
    expect(score?.candidates.map((c) => c.label)).toEqual(['X', '10']);
  });

  it('does not offer candidates when the hole is nowhere near a boundary', () => {
    const [score] = scoreMarks([mark({ xMm: 40 })], TARGET);
    expect(score?.computed.edgeCall).toBe(false);
    expect(score?.candidates).toEqual([]);
  });

  it("honors the user's call over the computed value", () => {
    const [score] = scoreMarks([mark({ xMm: 15.3, calledRingLabel: '10' })], TARGET);
    expect(score?.called).toBe(true);
    expect(score?.effective.label).toBe('10');
    expect(score?.effective.isInnerTen).toBe(false);
    // the computed value is still reported, unchanged
    expect(score?.computed.ringLabel).toBe('X');
  });

  it('ignores a call for a ring that is not one of the two candidates', () => {
    const [score] = scoreMarks([mark({ xMm: 15.3, calledRingLabel: '7' })], TARGET);
    expect(score?.called).toBe(false);
    expect(score?.effective.label).toBe('X');
  });

  it('a miss has no candidates to argue about', () => {
    const [score] = scoreMarks([mark({ xMm: 400 })], TARGET);
    expect(score?.computed.ringLabel).toBe('0');
    expect(score?.candidates).toEqual([]);
    expect(score?.effective.value).toBe(0);
  });
});

describe('seriesScoreLine', () => {
  it('totals the effective values and sorts the per-shot list descending', () => {
    const marks = [
      // near edge = radius - caliber/2 = r - 2.8mm; rings at 12.5/25/50/75mm
      mark({ id: 'a', xMm: 0 }), // near edge 0    -> X  (10)
      mark({ id: 'b', xMm: 30 }), // near edge 27.2 -> 9
      mark({ id: 'c', xMm: 60 }), // near edge 57.2 -> 8
    ];
    const line = seriesScoreLine(marks, scoreMarks(marks, TARGET));
    expect(line.total).toBe(27);
    expect(line.shotValues).toEqual([10, 9, 8]);
  });

  it('counts X only where the shooter called it, never from the tap', () => {
    const marks = [
      mark({ id: 'a', xMm: 0, isInnerTen: true }),
      // dead center, but not called — a tap cannot know centrumtia
      mark({ id: 'b', xMm: 0 }),
    ];
    const line = seriesScoreLine(marks, scoreMarks(marks, TARGET));
    expect(line.innerTenCount).toBe(1);
    expect(line.total).toBe(20);
  });

  it('is empty for an unmarked series', () => {
    expect(seriesScoreLine([], [])).toEqual({ total: 0, innerTenCount: 0, shotValues: [] });
  });
});

describe('marksToShotMarkInputs', () => {
  it('preserves placement order and stores integer-mode tenths', () => {
    const marks = [mark({ id: 'a', xMm: 30 }), mark({ id: 'b', xMm: 0, isInnerTen: true })];
    const rows = marksToShotMarkInputs(marks, scoreMarks(marks, TARGET));
    expect(rows).toEqual([
      { xMm: 30, yMm: 0, caliberMm: 5.6, valueTenths: 90, isInnerTen: false },
      { xMm: 0, yMm: 0, caliberMm: 5.6, valueTenths: 100, isInnerTen: true },
    ]);
  });

  it("persists the user's edge call, not the computed value", () => {
    const marks = [mark({ id: 'a', xMm: 15.3, calledRingLabel: '10' })];
    expect(marksToShotMarkInputs(marks, scoreMarks(marks, TARGET))[0]?.valueTenths).toBe(100);
  });
});
