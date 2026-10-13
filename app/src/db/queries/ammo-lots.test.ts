import { beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { ammoLots, sessions, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  createAmmoLot,
  getAmmoLot,
  listAmmoLots,
  mergeAmmoLots,
  softDeleteAmmoLot,
  updateAmmoLot,
} from './ammo-lots';
import { getAmmoLotUsage } from './ammo-usage';
import { addSeries } from './series';
import { createSession, softDeleteSession } from './sessions';
import { addShot } from './shots';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createAmmoLot', () => {
  it('stores factory-ammo fields', () => {
    const lot = createAmmoLot(db, {
      label: 'SK Standard Plus',
      caliber: '.22 LR',
      brand: 'SK',
      product: 'Standard Plus',
      lotNumber: 'L2024-08',
    });
    expect(lot.isHandload).toBe(0);
    expect(lot.brand).toBe('SK');
  });

  it('stores handload recipe fields', () => {
    const lot = createAmmoLot(db, {
      label: '.32 wadcutter',
      isHandload: true,
      powder: 'Vihtavuori N320',
      powderChargeGr: 1.8,
      colMm: 31.75,
    });
    expect(lot.isHandload).toBe(1);
    expect(lot.powder).toBe('Vihtavuori N320');
    expect(lot.powderChargeGr).toBe(1.8);
    expect(lot.colMm).toBe(31.75);
  });

  it('round-trips the chronographed velocity', () => {
    const lot = createAmmoLot(db, {
      label: '9x19 124 gr',
      bulletWeightGr: 124,
      velocityMps: 350.5,
    });
    expect(lot.velocityMps).toBe(350.5);
    expect(getAmmoLot(db, lot.id)?.velocityMps).toBe(350.5);
  });

  it('leaves velocity null when not supplied', () => {
    const lot = createAmmoLot(db, { label: 'No chrono' });
    expect(lot.velocityMps).toBeNull();
    expect(getAmmoLot(db, lot.id)?.velocityMps).toBeNull();
  });
});

describe('listAmmoLots / softDeleteAmmoLot', () => {
  it('excludes tombstoned lots', () => {
    const a = createAmmoLot(db, { label: 'A' });
    const b = createAmmoLot(db, { label: 'B' });
    softDeleteAmmoLot(db, a.id);
    expect(listAmmoLots(db).map((l) => l.id)).toEqual([b.id]);
    expect(getAmmoLot(db, a.id)).toBeUndefined();
  });
});

describe('updateAmmoLot', () => {
  it('bumps updated_at and applies the patch', () => {
    const lot = createAmmoLot(db, { label: 'A' });
    const updated = updateAmmoLot(db, lot.id, { quantity: 42 });
    expect(updated?.quantity).toBe(42);
    expect(updated?.updatedAt).toBeTruthy();
  });

  it('sets and clears velocity', () => {
    const lot = createAmmoLot(db, { label: 'A', bulletWeightGr: 124 });
    expect(updateAmmoLot(db, lot.id, { velocityMps: 348 })?.velocityMps).toBe(348);
    expect(updateAmmoLot(db, lot.id, { velocityMps: null })?.velocityMps).toBeNull();
  });
});

describe('mergeAmmoLots (docs/specs/ammo-lot-merge-spec.md)', () => {
  const session = (ammoLotId: string | null, name = 'S') =>
    createSession(db, {
      name,
      type: 'training',
      disciplineId: 'spsf-precision',
      ammoLotId,
      startedAt: '2026-10-01T10:00:00.000Z',
    });
  const sessionRow = (id: string) => db.select().from(sessions).where(eq(sessions.id, id)).get()!;
  const lotRow = (id: string) => db.select().from(ammoLots).where(eq(ammoLots.id, id)).get()!;

  it('A1 live sessions on the duplicate move to the kept lot with updated_at now; others untouched', () => {
    const dup = createAmmoLot(db, { label: 'Dup' });
    const kept = createAmmoLot(db, { label: 'Kept' });
    const other = createAmmoLot(db, { label: 'Other' });
    const a = session(dup.id);
    const b = session(dup.id);
    const onOther = session(other.id);
    const none = session(null);
    const before = [sessionRow(onOther.id), sessionRow(none.id)];
    const start = new Date().toISOString();

    expect(mergeAmmoLots(db, dup.id, kept.id)).toEqual({ ok: true, moved: 2 });

    for (const id of [a.id, b.id]) {
      expect(sessionRow(id).ammoLotId).toBe(kept.id);
      expect(sessionRow(id).updatedAt >= start).toBe(true);
    }
    expect([sessionRow(onOther.id), sessionRow(none.id)]).toEqual(before);
  });

  it('A2 a deleted session on the duplicate keeps its lot (M3)', () => {
    const dup = createAmmoLot(db, { label: 'Dup' });
    const kept = createAmmoLot(db, { label: 'Kept' });
    const gone = session(dup.id);
    softDeleteSession(db, gone.id);
    const before = sessionRow(gone.id);

    expect(mergeAmmoLots(db, dup.id, kept.id)).toEqual({ ok: true, moved: 0 });
    expect(sessionRow(gone.id)).toEqual(before);
  });

  it('A3 the duplicate is soft-deleted; the kept lot row is unchanged (M2)', () => {
    const dup = createAmmoLot(db, { label: 'Dup', quantity: 500, notes: 'box 2' });
    const kept = createAmmoLot(db, { label: 'Kept', quantity: 100 });
    session(dup.id);
    const keptBefore = lotRow(kept.id);
    const start = new Date().toISOString();

    mergeAmmoLots(db, dup.id, kept.id);

    const gone = lotRow(dup.id);
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.deletedAt! >= start).toBe(true);
    expect(gone.updatedAt).toBe(gone.deletedAt);
    expect(getAmmoLot(db, dup.id)).toBeUndefined();
    expect(lotRow(kept.id)).toEqual(keptBefore);
  });

  it('A4 same lot → sameLot; an unknown or deleted lot → unknownLot; nothing written', () => {
    const dup = createAmmoLot(db, { label: 'Dup' });
    const kept = createAmmoLot(db, { label: 'Kept' });
    const deleted = createAmmoLot(db, { label: 'Deleted' });
    softDeleteAmmoLot(db, deleted.id);
    const s = session(dup.id);
    db.delete(syncOutbox).run();
    const snapshot = () => [db.select().from(sessions).all(), db.select().from(ammoLots).all()];
    const before = snapshot();

    expect(mergeAmmoLots(db, dup.id, dup.id)).toEqual({ ok: false, error: 'sameLot' });
    expect(mergeAmmoLots(db, dup.id, 'missing')).toEqual({ ok: false, error: 'unknownLot' });
    expect(mergeAmmoLots(db, 'missing', kept.id)).toEqual({ ok: false, error: 'unknownLot' });
    expect(mergeAmmoLots(db, dup.id, deleted.id)).toEqual({ ok: false, error: 'unknownLot' });
    expect(mergeAmmoLots(db, deleted.id, kept.id)).toEqual({ ok: false, error: 'unknownLot' });

    expect(snapshot()).toEqual(before);
    expect(sessionRow(s.id).ammoLotId).toBe(dup.id);
    expect(db.select().from(syncOutbox).all()).toHaveLength(0);
  });

  it('A5 the outbox holds one sessions change per moved session and one ammo_lots change', () => {
    const dup = createAmmoLot(db, { label: 'Dup' });
    const kept = createAmmoLot(db, { label: 'Kept' });
    const a = session(dup.id);
    const b = session(dup.id);
    session(kept.id);
    db.delete(syncOutbox).run();

    mergeAmmoLots(db, dup.id, kept.id);

    const queued = db
      .select({ tableName: syncOutbox.tableName, rowId: syncOutbox.rowId })
      .from(syncOutbox)
      .all()
      .map((r) => `${r.tableName}:${r.rowId}`)
      .sort();
    expect(queued).toEqual([`ammo_lots:${dup.id}`, `sessions:${a.id}`, `sessions:${b.id}`].sort());
  });

  it("A6 the kept lot's usage equals both lots' usage before", () => {
    const dup = createAmmoLot(db, { label: 'Dup' });
    const kept = createAmmoLot(db, { label: 'Kept' });
    for (const [lot, rounds] of [
      [dup.id, [10, 9]],
      [dup.id, [8]],
      [kept.id, [7, 6, 5]],
    ] as const) {
      const s = session(lot);
      const series = addSeries(db, { sessionId: s.id, position: 1 });
      rounds.forEach((value, i) =>
        addShot(db, { seriesId: series.id, position: i + 1, valueTenths: value * 10 }),
      );
    }
    const a = getAmmoLotUsage(db, dup.id);
    const b = getAmmoLotUsage(db, kept.id);

    mergeAmmoLots(db, dup.id, kept.id);

    expect(getAmmoLotUsage(db, kept.id)).toEqual({
      sessionCount: a.sessionCount + b.sessionCount,
      shotCount: a.shotCount + b.shotCount,
    });
    expect(getAmmoLotUsage(db, dup.id)).toEqual({ sessionCount: 0, shotCount: 0 });
  });
});
