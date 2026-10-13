import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ClientChangeSchema, PUSH_BATCH_MAX, PushRequestSchema } from '../sync/protocol';
import {
  buildAmmoLotMerge,
  type AmmoLotMergeContext,
  type AmmoLotMergeResult,
} from './ammo-lot-merge';
import { applyRank } from './order';
import type { Payload } from './rows';

const NOW = '2026-10-13T21:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

function makeDeps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  return {
    newId: () => `0199b000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
  };
}

const session = (id: string, lot: string | null, fields: Payload = {}): Payload => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  name: `Session ${id}`,
  type: 'training',
  discipline_id: 'spsf-precision',
  ammo_lot_id: lot,
  // A column this build does not know must survive a rewrite.
  future_column: 'kept',
  ...fields,
});

const lot = (id: string, fields: Payload = {}): Payload => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  label: `Lot ${id}`,
  quantity: 100,
  notes: null,
  ...fields,
});

const byId = (rows: Payload[]) => new Map(rows.map((r) => [r.id as string, r]));

function logbook(): AmmoLotMergeContext {
  return {
    ammoLots: byId([lot('dup'), lot('kept'), lot('other'), lot('gone', { deleted_at: OLD })]),
    sessions: byId([
      session('s1', 'dup'),
      session('s2', 'dup'),
      session('s3', 'kept'),
      session('s4', 'other'),
      session('s5', null),
      session('s6', 'dup', { deleted_at: OLD }),
    ]),
  };
}

const okOf = (result: AmmoLotMergeResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
};

const build = (dup: string, kept: string, context = logbook()) =>
  buildAmmoLotMerge(dup, kept, context, makeDeps());

describe('buildAmmoLotMerge (docs/specs/ammo-lot-merge-spec.md)', () => {
  it('K1 each live session on the duplicate is its pulled payload with ammo_lot_id = kept, updated_at = now; unknown keys survive', () => {
    const context = logbook();
    const { changes, moved } = okOf(build('dup', 'kept', context));
    const sessions = changes.filter((c) => c.tableName === 'sessions');
    expect(moved).toBe(2);
    expect(sessions.map((c) => c.rowId)).toEqual(['s1', 's2']);
    for (const change of sessions) {
      expect(change.payload).toEqual({
        ...context.sessions.get(change.rowId)!,
        ammo_lot_id: 'kept',
        updated_at: NOW,
      });
      expect((change.payload as Payload).future_column).toBe('kept');
      expect(change.deletedAt).toBeNull();
    }
  });

  it('K2 the duplicate is one tombstone change; no change for the kept lot or any other row', () => {
    const { changes } = okOf(build('dup', 'kept'));
    const lots = changes.filter((c) => c.tableName === 'ammo_lots');
    expect(lots).toEqual([
      expect.objectContaining({ rowId: 'dup', payload: null, deletedAt: NOW, updatedAt: NOW }),
    ]);
    expect(changes.map((c) => `${c.tableName}:${c.rowId}`)).toEqual([
      'ammo_lots:dup',
      'sessions:s1',
      'sessions:s2',
    ]);
  });

  it('K3 a session with deleted_at in its payload is not written', () => {
    const { changes } = okOf(build('dup', 'kept'));
    expect(changes.some((c) => c.rowId === 's6')).toBe(false);
  });

  it('K4 same lot → sameLot; either lot absent or deleted → unknownLot', () => {
    expect(build('dup', 'dup')).toEqual({ ok: false, errors: [{ kind: 'sameLot' }] });
    const unknown = { ok: false, errors: [{ kind: 'unknownLot' }] };
    expect(build('dup', 'missing')).toEqual(unknown);
    expect(build('missing', 'kept')).toEqual(unknown);
    expect(build('dup', 'gone')).toEqual(unknown);
    expect(build('gone', 'kept')).toEqual(unknown);
    // Pulled payloads without a deleted_at key are live.
    const bare = { ...logbook(), ammoLots: byId([{ id: 'a' }, { id: 'b' }]) };
    expect(okOf(build('a', 'b', bare)).changes).toHaveLength(1);
  });

  it('K5 a duplicate with no sessions: only the tombstone', () => {
    const { changes, moved } = okOf(build('other', 'dup', { ...logbook(), sessions: new Map() }));
    expect(moved).toBe(0);
    expect(changes.map((c) => `${c.tableName}:${c.rowId}`)).toEqual(['ammo_lots:other']);
  });

  it('K6 over PUSH_BATCH_MAX → tooManyChanges(max, needed); exactly 500 is allowed', () => {
    const many = (n: number): AmmoLotMergeContext => ({
      ...logbook(),
      sessions: byId(Array.from({ length: n }, (_, i) => session(`m${i}`, 'dup'))),
    });
    // One change per session plus the tombstone.
    expect(okOf(build('dup', 'kept', many(PUSH_BATCH_MAX - 1))).changes).toHaveLength(
      PUSH_BATCH_MAX,
    );
    expect(build('dup', 'kept', many(PUSH_BATCH_MAX))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: PUSH_BATCH_MAX + 1 }],
    });
  });

  it('K7 every change parses with ClientChangeSchema, fresh ids, rowId = id, in APPLY_ORDER', () => {
    const { changes } = okOf(build('dup', 'kept'));
    expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes }).success).toBe(true);
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      expect(change.updatedAt).toBe(NOW);
      if (change.payload !== null) expect(change.rowId).toBe((change.payload as Payload).id);
    }
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
    const ranks = changes.map((c) => applyRank(c.tableName));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

// --- K8: the merge, applied, leaves no live session on the duplicate and
// changes nothing else. The oracle is independent of the builder: it moves
// the live sessions one at a time, as the phone's UPDATE does.

const LOTS = ['a', 'b', 'c', 'd'];

const worldArb = fc.record({
  lots: fc.array(fc.boolean(), { minLength: LOTS.length, maxLength: LOTS.length }),
  sessions: fc.array(
    fc.record({ lot: fc.constantFrom(null, ...LOTS, 'zz'), deleted: fc.boolean() }),
    { maxLength: 15 },
  ),
  dup: fc.constantFrom(...LOTS, 'zz'),
  kept: fc.constantFrom(...LOTS, 'zz'),
});

const isLive = (row: Payload | undefined) =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

function applied(
  context: AmmoLotMergeContext,
  changes: AmmoLotMergeResult & { ok: true },
): AmmoLotMergeContext {
  const sessions = new Map(context.sessions);
  const ammoLots = new Map(context.ammoLots);
  for (const c of changes.changes) {
    const table = c.tableName === 'sessions' ? sessions : ammoLots;
    table.set(
      c.rowId,
      c.payload === null
        ? { ...table.get(c.rowId)!, deleted_at: c.deletedAt, updated_at: c.updatedAt }
        : (c.payload as Payload),
    );
  }
  return { sessions, ammoLots };
}

describe('buildAmmoLotMerge — property', () => {
  it('K8 applied, no live session is left on the duplicate, and nothing else changes', () => {
    fc.assert(
      fc.property(worldArb, (w) => {
        const context: AmmoLotMergeContext = {
          ammoLots: byId(LOTS.map((id, i) => lot(id, { deleted_at: w.lots[i] ? null : OLD }))),
          sessions: byId(
            w.sessions.map((s, i) =>
              session(`s${i}`, s.lot, { deleted_at: s.deleted ? OLD : null }),
            ),
          ),
        };
        const result = buildAmmoLotMerge(w.dup, w.kept, context, makeDeps());
        const bothLive =
          isLive(context.ammoLots.get(w.dup)) && isLive(context.ammoLots.get(w.kept));
        if (w.dup === w.kept || !bothLive) {
          expect(result.ok).toBe(false);
          return;
        }
        const after = applied(context, okOf(result));

        // Expected: each live session on dup now on kept; every other row identical.
        for (const [id, before] of context.sessions) {
          const now = after.sessions.get(id)!;
          if (isLive(before) && before.ammo_lot_id === w.dup) {
            expect(now).toEqual({ ...before, ammo_lot_id: w.kept, updated_at: NOW });
          } else {
            expect(now).toBe(before);
          }
        }
        for (const [id, before] of context.ammoLots) {
          if (id === w.dup) expect(isLive(after.ammoLots.get(id))).toBe(false);
          else expect(after.ammoLots.get(id)).toBe(before);
        }
        expect(okOf(result).moved).toBe(
          [...context.sessions.values()].filter((s) => isLive(s) && s.ammo_lot_id === w.dup).length,
        );
      }),
      { numRuns: 300 },
    );
  });
});
