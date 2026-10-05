import type { AssistEntry, PlacedSuggestion } from './assist-log';
import { countAssist, summarizeAssist } from './assist-log';
import { createMarkState, markReducer } from './marks';

const placed: PlacedSuggestion[] = [
  { id: 'a', xMm: 0, yMm: 0, filled: false },
  { id: 'b', xMm: 20, yMm: 0, filled: false },
  { id: 'c', xMm: 40, yMm: 0, filled: false },
  { id: 'd', xMm: 60, yMm: 0, filled: true },
];

function entry(flags: Record<string, boolean>, counts: AssistEntry['counts']): AssistEntry {
  return {
    at: '2026-10-06T10:00:00.000Z',
    faceId: 'spsf-precision',
    lock: 'auto',
    flags,
    seriesLength: 5,
    caliberMm: 5.6,
    outcome: 'ran',
    timingsMs: { lock: null, suggest: null, marking: null },
    counts,
    suggestions: [],
    marks: [],
  };
}

describe('countAssist', () => {
  it('reads kept, nudged, deleted and added off what the reducer saved', () => {
    let state = markReducer(createMarkState({ maxMarks: 5, caliberMm: 5.6 }), {
      type: 'suggest',
      marks: placed,
    });
    state = markReducer(state, { type: 'move', id: 'b', xMm: 21, yMm: 1 });
    state = markReducer(state, { type: 'select', id: 'd' });
    state = markReducer(state, { type: 'delete' });
    state = markReducer(state, { type: 'tap', id: 'e', xMm: -30, yMm: 10 });

    expect(countAssist(placed, state.marks)).toEqual({
      suggested: 4,
      filled: 1,
      kept: 2,
      nudged: 1,
      deleted: 1,
      deletedFilled: 1,
      added: 1,
    });
  });

  it('counts undone suggestions as deleted', () => {
    let state = markReducer(createMarkState({ maxMarks: 5, caliberMm: 5.6 }), {
      type: 'suggest',
      marks: placed,
    });
    state = markReducer(state, { type: 'undo' });

    expect(countAssist(placed, state.marks)).toMatchObject({ kept: 0, deleted: 4, added: 0 });
  });
});

describe('summarizeAssist', () => {
  const counts = (kept: number, deleted: number, added: number): AssistEntry['counts'] => ({
    suggested: kept + deleted,
    filled: 0,
    kept,
    nudged: 0,
    deleted,
    deletedFilled: 0,
    added,
  });

  it('pools the entries by the flags that were on, no flags first', () => {
    const rows = summarizeAssist([
      entry({ fill: true, faint: false }, counts(4, 1, 1)),
      entry({ fill: false, faint: false }, counts(3, 0, 2)),
      entry({ fill: true, faint: false }, counts(5, 1, 0)),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ flagsOn: [], series: 1, precision: 1, recall: 0.6 });
    expect(rows[1]).toMatchObject({ flagsOn: ['fill'], series: 2, precision: 9 / 11, recall: 0.9 });
  });

  it('leaves the rates null when there is nothing to divide by', () => {
    expect(summarizeAssist([entry({}, counts(0, 0, 0))])[0]).toMatchObject({
      precision: null,
      recall: null,
    });
  });
});
