import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SYNC_TABLE_NAMES, type ChangeRow, type SyncTableName } from '../sync/protocol';
import { APPLY_ORDER, applyRank, sortChangesForApply } from './order';

function change(tableName: SyncTableName, seq: number, rowId = `r${seq}`): ChangeRow {
  return { tableName, rowId, seq, payload: {}, deletedAt: null, updatedAt: '2026-09-02T00:00:00Z' };
}

describe('APPLY_ORDER', () => {
  it('is a permutation of the protocol table enum', () => {
    expect([...APPLY_ORDER].sort()).toEqual([...SYNC_TABLE_NAMES].sort());
  });

  it('places every parent before the tables that reference it', () => {
    const rank = (t: SyncTableName) => APPLY_ORDER.indexOf(t);
    // Matches app/src/db/schema.ts's `references()` declarations.
    const edges: [SyncTableName, SyncTableName][] = [
      ['firearms', 'licenses'],
      ['firearms', 'firearm_groups'],
      ['firearms', 'maintenance_events'],
      ['firearms', 'sessions'],
      ['ammo_lots', 'sessions'],
      ['sessions', 'series'],
      ['series', 'shots'],
    ];
    for (const [parent, child] of edges) {
      expect(rank(parent)).toBeLessThan(rank(child));
    }
  });

  it('ranks an unknown table last rather than throwing', () => {
    expect(applyRank('nope' as SyncTableName)).toBe(APPLY_ORDER.length);
  });
});

describe('sortChangesForApply', () => {
  it('orders by table dependency rank', () => {
    const sorted = sortChangesForApply([change('shots', 1), change('firearms', 2)]);
    expect(sorted.map((c) => c.tableName)).toEqual(['firearms', 'shots']);
  });

  it('orders by seq within a table so the later write is applied last', () => {
    const sorted = sortChangesForApply([change('sessions', 9), change('sessions', 3)]);
    expect(sorted.map((c) => c.seq)).toEqual([3, 9]);
  });

  it('does not mutate its input', () => {
    const input = [change('shots', 1), change('firearms', 2)];
    sortChangesForApply(input);
    expect(input.map((c) => c.tableName)).toEqual(['shots', 'firearms']);
  });

  const arbChange = fc
    .record({
      tableName: fc.constantFrom(...SYNC_TABLE_NAMES),
      seq: fc.integer({ min: 1, max: 50 }),
      rowId: fc.string({ minLength: 1, maxLength: 4 }),
    })
    .map(({ tableName, seq, rowId }) => change(tableName, seq, rowId));

  it('property: is a permutation of its input', () => {
    fc.assert(
      fc.property(fc.array(arbChange, { maxLength: 30 }), (changes) => {
        const key = (c: ChangeRow) => `${c.tableName}|${c.rowId}|${c.seq}`;
        const sorted = sortChangesForApply(changes);
        expect(sorted).toHaveLength(changes.length);
        expect(sorted.map(key).sort()).toEqual(changes.map(key).sort());
      }),
    );
  });

  it('property: ranks are non-decreasing and seq is non-decreasing within a table', () => {
    fc.assert(
      fc.property(fc.array(arbChange, { maxLength: 30 }), (changes) => {
        const sorted = sortChangesForApply(changes);
        for (let i = 1; i < sorted.length; i += 1) {
          const prev = sorted[i - 1]!;
          const cur = sorted[i]!;
          expect(applyRank(prev.tableName)).toBeLessThanOrEqual(applyRank(cur.tableName));
          if (prev.tableName === cur.tableName) {
            expect(prev.seq).toBeLessThanOrEqual(cur.seq);
          }
        }
      }),
    );
  });
});
