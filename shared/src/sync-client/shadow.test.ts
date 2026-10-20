import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ChangeRowSchema, SYNC_TABLE_NAMES, type ChangeRow } from '../sync/protocol';
import type { RefusalMark } from './ports';
import {
  applyMarkUpdate,
  filterShadowedChanges,
  countMarks,
  marksFromRefusals,
  rowKey,
  shadowPull,
  tombstoneFromRejection,
} from './shadow';

function change(rowId: string, tableName: ChangeRow['tableName'] = 'sessions'): ChangeRow {
  return { tableName, rowId, seq: 1, payload: {}, deletedAt: null, updatedAt: 'u' };
}

describe('rowKey', () => {
  it('separates table from row so two tables cannot collide', () => {
    expect(rowKey('sessions', 'a')).not.toBe(rowKey('series', 'a'));
  });
});

describe('filterShadowedChanges', () => {
  it('drops a change for a row with a queued local edit', () => {
    const kept = filterShadowedChanges(
      [change('a'), change('b')],
      new Set([rowKey('sessions', 'a')]),
    );
    expect(kept.map((c) => c.rowId)).toEqual(['b']);
  });

  it('keeps everything when nothing is queued', () => {
    expect(filterShadowedChanges([change('a')], new Set())).toHaveLength(1);
  });

  it('only shadows the same table', () => {
    const kept = filterShadowedChanges([change('a', 'series')], new Set([rowKey('sessions', 'a')]));
    expect(kept).toHaveLength(1);
  });

  it('property: the result is always a subset, in the original order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 3 }), { maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 3 }), { maxLength: 20 }),
        (rowIds, pending) => {
          const changes = rowIds.map((id) => change(id));
          const keys = new Set(pending.map((id) => rowKey('sessions', id)));
          const kept = filterShadowedChanges(changes, keys);
          expect(kept.length).toBeLessThanOrEqual(changes.length);
          expect(kept.every((c) => !keys.has(rowKey(c.tableName, c.rowId)))).toBe(true);
          expect(kept.map((c) => c.rowId)).toEqual(
            changes.map((c) => c.rowId).filter((id) => !keys.has(rowKey('sessions', id))),
          );
        },
      ),
    );
  });
});

describe('tombstoneFromRejection', () => {
  it('produces a valid tombstone change row', () => {
    const row = tombstoneFromRejection(
      { tableName: 'series', rowId: 'r1', rev: 4, clientChangeId: null },
      '2026-09-02T12:00:00.000Z',
    );
    expect(row).toEqual({
      tableName: 'series',
      rowId: 'r1',
      seq: 1,
      payload: null,
      deletedAt: '2026-09-02T12:00:00.000Z',
      updatedAt: '2026-09-02T12:00:00.000Z',
    });
    expect(ChangeRowSchema.safeParse(row).success).toBe(true);
  });

  it('property: always parses as a ChangeRow for any table', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SYNC_TABLE_NAMES),
        fc.string({ minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1, maxLength: 6 }),
        (tableName, rowId, deletedAt) => {
          const row = tombstoneFromRejection(
            { tableName, rowId, rev: 1, clientChangeId: null },
            deletedAt,
          );
          expect(ChangeRowSchema.safeParse(row).success).toBe(true);
        },
      ),
    );
  });
});

// docs/specs/sync-family-refusal-spec.md §11.6, the shadowing table.
describe('shadowPull', () => {
  const mark = (rowId: string, arrival: number, kind: RefusalMark['kind'] = 'waiting') => ({
    tableName: 'sessions' as const,
    rowId,
    kind,
    arrival,
    blocker: kind === 'waiting' ? { tableName: 'shots' as const, rowId: 't2' } : null,
  });
  const at = (rowId: string, arrival: number): ChangeRow => ({ ...change(rowId), arrival });
  const tombstone = (rowId: string, arrival: number): ChangeRow => ({
    ...at(rowId, arrival),
    payload: null,
    deletedAt: 'd',
  });

  it('a queued entry shadows anything, mark or not, and keeps the mark', () => {
    const marks = [mark('a', 5)];
    const out = shadowPull(
      [at('a', 9), tombstone('b', 9)],
      new Set([rowKey('sessions', 'a'), rowKey('sessions', 'b')]),
      marks,
    );
    expect(out).toEqual({ applicable: [], marks, shadowed: 2 });
  });

  it('a mark and a pulled tombstone: applied, and the mark dropped (R2)', () => {
    const out = shadowPull([tombstone('a', 1)], new Set(), [mark('a', 5), mark('b', 5)]);
    expect(out.applicable.map((c) => c.rowId)).toEqual(['a']);
    expect(out.marks).toEqual([mark('b', 5)]);
    expect(out.shadowed).toBe(0);
  });

  it('a mark and a live change at the mark’s arrival or later: applied, and the mark dropped', () => {
    const equal = shadowPull([at('a', 5)], new Set(), [mark('a', 5)]);
    expect(equal).toEqual({ applicable: [at('a', 5)], marks: [], shadowed: 0 });
    const later = shadowPull([at('a', 6)], new Set(), [mark('a', 5, 'invalid')]);
    expect(later).toEqual({ applicable: [at('a', 6)], marks: [], shadowed: 0 });
  });

  it('a mark and a live change below the mark’s arrival: shadowed, and the mark kept (ECHO)', () => {
    const marks = [mark('a', 5)];
    expect(shadowPull([at('a', 4)], new Set(), marks)).toEqual({
      applicable: [],
      marks,
      shadowed: 1,
    });
  });

  it('a live change with no arrival is older than any mark', () => {
    expect(shadowPull([change('a')], new Set(), [mark('a', 1)]).shadowed).toBe(1);
  });

  it('neither: applied, as today; a mark of another table does not match', () => {
    const other = { ...mark('a', 9), tableName: 'series' as const };
    const out = shadowPull([at('a', 1), at('b', 1)], new Set(), [other]);
    expect(out).toEqual({ applicable: [at('a', 1), at('b', 1)], marks: [other], shadowed: 0 });
  });

  it('a page with two changes of one marked row judges each against the mark it meets', () => {
    // The first applies and drops the mark, so the second applies too.
    const out = shadowPull([at('a', 6), at('a', 3)], new Set(), [mark('a', 5)]);
    expect(out.applicable).toEqual([at('a', 6), at('a', 3)]);
    expect(out.marks).toEqual([]);
  });
});

describe('marksFromRefusals', () => {
  it('turns a bad row into an invalid mark and a waiting row into a waiting mark', () => {
    expect(
      marksFromRefusals([
        { tableName: 'shots', rowId: 't2', reason: 'invalid_payload', arrival: 3, blocker: null },
        {
          tableName: 'series',
          rowId: 'r1',
          reason: 'family_refused',
          arrival: 4,
          blocker: { tableName: 'shots', rowId: 't2' },
        },
      ]),
    ).toEqual([
      { tableName: 'shots', rowId: 't2', kind: 'invalid', arrival: 3, blocker: null },
      {
        tableName: 'series',
        rowId: 'r1',
        kind: 'waiting',
        arrival: 4,
        blocker: { tableName: 'shots', rowId: 't2' },
      },
    ]);
  });
});

describe('applyMarkUpdate', () => {
  const at = (
    rowId: string,
    arrival: number,
    kind: RefusalMark['kind'] = 'waiting',
  ): RefusalMark => ({
    tableName: 'series',
    rowId,
    kind,
    arrival,
    blocker: null,
  });
  const ref = { tableName: 'series' as const, rowId: 'a' };

  it('a set adds a mark, or replaces one that arrived no later, keeping the others', () => {
    expect(applyMarkUpdate([at('b', 1)], { set: at('a', 3) })).toEqual([at('b', 1), at('a', 3)]);
    expect(applyMarkUpdate([at('a', 3)], { set: at('a', 3, 'invalid') })).toEqual([
      at('a', 3, 'invalid'),
    ]);
    expect(applyMarkUpdate([at('a', 2)], { set: at('a', 3, 'invalid') })).toEqual([
      at('a', 3, 'invalid'),
    ]);
  });

  it('a set keeps a mark that arrived later', () => {
    expect(applyMarkUpdate([at('a', 9)], { set: at('a', 3, 'invalid') })).toEqual([at('a', 9)]);
  });

  it('a drop deletes a mark up to its arrival and spares a later one', () => {
    expect(applyMarkUpdate([at('a', 3), at('b', 1)], { drop: ref, upTo: 3 })).toEqual([at('b', 1)]);
    expect(applyMarkUpdate([at('a', 4)], { drop: ref, upTo: 3 })).toEqual([at('a', 4)]);
    expect(applyMarkUpdate([], { drop: ref, upTo: 3 })).toEqual([]);
  });

  it('matches table and row, not the row id alone', () => {
    const other = { ...at('a', 1), tableName: 'shots' as const };
    expect(applyMarkUpdate([other], { drop: ref, upTo: 5 })).toEqual([other]);
  });
});

describe('countMarks', () => {
  const mark = (kind: RefusalMark['kind'], rowId: string): RefusalMark => ({
    tableName: 'shots',
    rowId,
    kind,
    arrival: 1,
    blocker: null,
  });

  it('counts the invalid and the waiting marks apart (the Account & Sync lines)', () => {
    expect(countMarks([mark('invalid', 'a'), mark('waiting', 'b'), mark('waiting', 'c')])).toEqual({
      invalid: 1,
      waiting: 2,
    });
  });

  it('is zero for no marks', () => {
    expect(countMarks([])).toEqual({ invalid: 0, waiting: 0 });
  });
});
