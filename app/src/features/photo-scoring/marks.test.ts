import { SPSF_PISTOL_25M_PRECISION as TARGET } from '@shotledger/shared';

import type { Mark, MarkState } from './marks';
import {
  UNDO_LIMIT,
  canAddMark,
  canUndo,
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

  it('moves a named mark without it being selected, as a drag does', () => {
    const state = markReducer(tap(tap(start(), 'a', 0, 0), 'b', 5, 5), {
      type: 'move',
      id: 'a',
      xMm: 7,
      yMm: 8,
    });
    expect(state.marks[0]).toMatchObject({ id: 'a', xMm: 7, yMm: 8, moved: true });
    expect(state.selectedId).toBe('b');
    expect(markReducer(state, { type: 'move', id: 'nope', xMm: 1, yMm: 1 })).toBe(state);
  });

  it('setting the same caliber again changes nothing, and keeps the edge calls', () => {
    let state = tap(start(), 'a', 15.3, 0);
    state = markReducer(state, { type: 'callRing', ringLabel: '10' });
    expect(markReducer(state, { type: 'setCaliber', caliberMm: 5.6 })).toBe(state);
  });

  it('clear removes every mark', () => {
    const state = markReducer(tap(tap(start(), 'a', 0, 0), 'b', 5, 5), { type: 'clear' });
    expect(state.marks).toEqual([]);
    expect(state.selectedId).toBeNull();
  });
});

describe('suggest', () => {
  const suggest = (state: MarkState, marks: { id: string; xMm: number; yMm: number }[]) =>
    markReducer(state, { type: 'suggest', marks });

  it('places the proposals as dashed, unselected marks at the current caliber', () => {
    const state = suggest(start(), [
      { id: 'p1', xMm: 10, yMm: -5 },
      { id: 'p2', xMm: -20, yMm: 30 },
    ]);
    expect(state.marks.map((m) => [m.id, m.suggested, m.caliberMm])).toEqual([
      ['p1', true, 5.6],
      ['p2', true, 5.6],
    ]);
    expect(state.selectedId).toBeNull();
  });

  it('skips a proposal within one hole diameter of a mark the shooter placed', () => {
    const tapped = tap(start(), 'a', 10, -5);
    const state = suggest(tapped, [
      { id: 'p1', xMm: 13, yMm: -3 }, // 3.6 mm from 'a': the same hole
      { id: 'p2', xMm: 16, yMm: -5 }, // 6 mm away: a neighbour
    ]);
    expect(state.marks.map((m) => m.id)).toEqual(['a', 'p2']);
  });

  it('keeps the first proposals when the series cap would be exceeded', () => {
    const state = suggest(
      start({ maxMarks: 2 }),
      [1, 2, 3].map((i) => ({ id: `p${i}`, xMm: i * 20, yMm: 0 })),
    );
    expect(state.marks.map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('is one undo step, and a no-op when nothing is added', () => {
    const state = suggest(start(), [{ id: 'p1', xMm: 10, yMm: 0 }]);
    expect(markReducer(state, { type: 'undo' }).marks).toEqual([]);
    const same = suggest(state, [{ id: 'p2', xMm: 11, yMm: 0 }]);
    expect(same).toBe(state);
  });

  it('a suggested mark scores like any other and keeps its flag when moved', () => {
    const state = suggest(start(), [{ id: 'p1', xMm: 0, yMm: 0 }]);
    expect(scoreMarks(state.marks, TARGET)[0]?.effective.value).toBe(10);
    const moved = markReducer(state, { type: 'move', id: 'p1', xMm: 40, yMm: 0 });
    expect(moved.marks[0]).toMatchObject({ suggested: true, moved: true, xMm: 40 });
  });
});

describe('undo', () => {
  const undo = (state: MarkState) => markReducer(state, { type: 'undo' });

  it('does nothing with no history', () => {
    const state = start();
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
  });

  it('reverts an add, and the mark it removed is not selected any more', () => {
    const one = tap(start(), 'a', 0, 0);
    const two = tap(one, 'b', 5, 5);
    const back = undo(two);
    expect(back.marks.map((m) => m.id)).toEqual(['a']);
    expect(back.selectedId).toBe('a');
    expect(canUndo(undo(back))).toBe(false);
    expect(undo(back).marks).toEqual([]);
  });

  it('reverts a move, restoring position, moved flag and the edge call it cleared', () => {
    let state = tap(start(), 'a', 15.3, 0);
    state = markReducer(state, { type: 'callRing', ringLabel: '10' });
    state = markReducer(state, { type: 'move', xMm: 60, yMm: 0 });
    state = undo(state);
    expect(state.marks[0]).toMatchObject({
      xMm: 15.3,
      yMm: 0,
      moved: false,
      suggested: false,
      calledRingLabel: '10',
    });
  });

  it('reverts a delete', () => {
    let state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    state = markReducer(state, { type: 'delete' });
    expect(state.marks.map((m) => m.id)).toEqual(['a']);
    state = undo(state);
    expect(state.marks.map((m) => m.id)).toEqual(['a', 'b']);
    expect(state.selectedId).toBe('b');
  });

  it('reverts the X call, the ring call and a caliber change', () => {
    let state = tap(start(), 'a', 15.3, 0);
    const placed = state;
    state = markReducer(state, { type: 'toggleInnerTen' });
    state = markReducer(state, { type: 'callRing', ringLabel: '10' });
    state = markReducer(state, { type: 'setCaliber', caliberMm: 9 });
    state = undo(state);
    expect(state.caliberMm).toBe(5.6);
    expect(state.marks[0]).toMatchObject({ caliberMm: 5.6, calledRingLabel: '10' });
    state = undo(state);
    expect(state.marks[0]?.calledRingLabel).toBeNull();
    state = undo(state);
    expect(state.marks).toEqual(placed.marks);
  });

  it('does not spend a step on selecting, or on an action that changed nothing', () => {
    let state = tap(tap(start(), 'a', 0, 0), 'b', 5, 5);
    const depth = state.past.length;
    state = markReducer(state, { type: 'select', id: 'a' });
    state = markReducer(state, { type: 'deselect' });
    state = markReducer(state, { type: 'delete' });
    state = markReducer(state, { type: 'setCaliber', caliberMm: 5.6 });
    expect(state.past).toHaveLength(depth);
  });

  it('keeps at most UNDO_LIMIT steps, dropping the oldest', () => {
    let state = start({ maxMarks: 1 });
    state = tap(state, 'a', 0, 0);
    for (let i = 0; i < UNDO_LIMIT + 10; i += 1) {
      state = markReducer(state, { type: 'toggleInnerTen' });
    }
    expect(state.past).toHaveLength(UNDO_LIMIT);
    for (let i = 0; i < UNDO_LIMIT; i += 1) state = undo(state);
    // The add itself fell off the end, so the mark survives every undo.
    expect(state.marks).toHaveLength(1);
    expect(canUndo(state)).toBe(false);
  });

  it('clear drops the history with the marks', () => {
    const state = markReducer(tap(start(), 'a', 0, 0), { type: 'clear' });
    expect(canUndo(state)).toBe(false);
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
  suggested: false,
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
