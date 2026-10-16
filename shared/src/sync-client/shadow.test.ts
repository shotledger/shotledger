import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ChangeRowSchema, SYNC_TABLE_NAMES, type ChangeRow } from '../sync/protocol';
import { filterShadowedChanges, replacesHeldEdit, rowKey, tombstoneFromRejection } from './shadow';

function change(rowId: string, tableName: ChangeRow['tableName'] = 'sessions'): ChangeRow {
  return { tableName, rowId, seq: 1, payload: {}, deletedAt: null, updatedAt: 'u' };
}

describe('rowKey', () => {
  it('separates table from row so two tables cannot collide', () => {
    expect(rowKey('sessions', 'a')).not.toBe(rowKey('series', 'a'));
  });
});

describe('replacesHeldEdit (Revision 2 item 9)', () => {
  const at = (updatedAt: string, deletedAt: string | null = null): ChangeRow => ({
    ...change('a'),
    updatedAt,
    deletedAt,
    payload: deletedAt === null ? {} : null,
  });
  const local = (updatedAt: string) => ({ payload: {}, updatedAt, deletedAt: null });
  const T1 = '2026-10-14T11:00:00.000Z';
  const T2 = '2026-10-14T12:00:00.000Z';

  it('a strictly later live change replaces the held edit', () => {
    expect(replacesHeldEdit(at(T2), local(T1))).toBe(true);
  });

  it('this device’s own older push, pulled back, does not', () => {
    expect(replacesHeldEdit(at(T1), local(T2))).toBe(false);
  });

  it('an equal time does not', () => {
    expect(replacesHeldEdit(at(T1), local(T1))).toBe(false);
  });

  it('compares instants, not strings', () => {
    expect(replacesHeldEdit(at('2026-10-14T13:00:00.000+02:00'), local(T2))).toBe(false);
    expect(replacesHeldEdit(at('2026-10-14T12:00:00.001Z'), local(T2))).toBe(true);
  });

  it('a time that does not parse replaces nothing', () => {
    expect(replacesHeldEdit(at('u'), local(T1))).toBe(false);
    expect(replacesHeldEdit(at(T2), local('u'))).toBe(false);
  });

  it('a tombstone always replaces it, older or not (R2, tombstone wins)', () => {
    expect(replacesHeldEdit(at(T1, T1), local(T2))).toBe(true);
  });

  it('with no local row there is nothing to keep', () => {
    expect(replacesHeldEdit(at(T1), undefined)).toBe(true);
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
