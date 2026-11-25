// docs/specs/phone-foreign-keys-spec.md §7: whatever order a family arrives
// in, across any number of pulls, foreign keys hold after every pull and
// every row ends in its table.
import type { ChangeRow, SyncTableName } from '@shotledger/shared';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { series, sessions, shots, syncPendingRows } from '../schema';
import { createTestDb } from '../test-db';
import { addSeries } from './series';
import { createSession } from './sessions';
import { addShot } from './shots';
import { createSyncStore, readRowSync } from './sync-store';

// One session, three series, two shots each: ten synthetic rows.
function buildFamily(): ChangeRow[] {
  const source = createTestDb();
  const rows: ChangeRow[] = [];
  const pulled = (tableName: SyncTableName, rowId: string) => {
    const snapshot = readRowSync(source, tableName, rowId)!;
    rows.push({
      tableName,
      rowId,
      seq: rows.length + 1,
      arrival: rows.length + 1,
      payload: snapshot.payload,
      deletedAt: null,
      updatedAt: snapshot.updatedAt,
    } as ChangeRow);
  };
  const session = createSession(source, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-10-01T10:00:00.000Z',
  });
  pulled('sessions', session.id);
  for (let s = 1; s <= 3; s += 1) {
    const seriesRow = addSeries(source, { sessionId: session.id, position: s });
    pulled('series', seriesRow.id);
    for (let p = 1; p <= 2; p += 1) {
      pulled('shots', addShot(source, { seriesId: seriesRow.id, position: p, valueTenths: 90 }).id);
    }
  }
  return rows;
}

const family = buildFamily();

describe('PROP any arrival order of a family converges', () => {
  it('foreign_key_check is empty after every pull; every row lands and nothing waits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(family, { minLength: family.length, maxLength: family.length }),
        fc.array(fc.integer({ min: 0, max: 3 }), {
          minLength: family.length,
          maxLength: family.length,
        }),
        async (order, pullOf) => {
          const db = createTestDb();
          const store = createSyncStore(db);
          for (let pull = 0; pull <= 3; pull += 1) {
            const batch = order.filter((_, index) => pullOf[index] === pull);
            await store.applyChanges(batch);
            expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
          }
          const held = [
            ...db.select({ id: sessions.id }).from(sessions).all(),
            ...db.select({ id: series.id }).from(series).all(),
            ...db.select({ id: shots.id }).from(shots).all(),
          ].map((r) => r.id);
          expect(held.sort()).toEqual(family.map((c) => c.rowId).sort());
          expect(db.select().from(syncPendingRows).all()).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
