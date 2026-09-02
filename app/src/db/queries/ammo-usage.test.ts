import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createAmmoLot } from './ammo-lots';
import { getAmmoLotUsage } from './ammo-usage';
import { addSeries } from './series';
import { createSession } from './sessions';
import { addShot } from './shots';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getAmmoLotUsage', () => {
  it('counts sessions and shots (including sighters) linked to the lot', () => {
    const lot = createAmmoLot(db, { label: 'Test lot' });
    const otherLot = createAmmoLot(db, { label: 'Other lot' });

    const s1 = createSession(db, {
      name: 'S1',
      type: 'training',
      disciplineId: 'spsf-precision',
      ammoLotId: lot.id,
      startedAt: new Date().toISOString(),
    });
    const s2 = createSession(db, {
      name: 'S2',
      type: 'training',
      disciplineId: 'spsf-precision',
      ammoLotId: lot.id,
      startedAt: new Date().toISOString(),
    });
    const other = createSession(db, {
      name: 'Other',
      type: 'training',
      disciplineId: 'spsf-precision',
      ammoLotId: otherLot.id,
      startedAt: new Date().toISOString(),
    });

    const series1 = addSeries(db, { sessionId: s1.id, position: 1, isSighter: true });
    addShot(db, { seriesId: series1.id, position: 1, valueTenths: 90 });
    addShot(db, { seriesId: series1.id, position: 2, valueTenths: 90 });

    const series2 = addSeries(db, { sessionId: s2.id, position: 1 });
    addShot(db, { seriesId: series2.id, position: 1, valueTenths: 100 });

    const otherSeries = addSeries(db, { sessionId: other.id, position: 1 });
    addShot(db, { seriesId: otherSeries.id, position: 1, valueTenths: 100 });

    expect(getAmmoLotUsage(db, lot.id)).toEqual({ sessionCount: 2, shotCount: 3 });
    expect(getAmmoLotUsage(db, otherLot.id)).toEqual({ sessionCount: 1, shotCount: 1 });
  });

  it('returns zeros for an unused lot', () => {
    const lot = createAmmoLot(db, { label: 'Unused' });
    expect(getAmmoLotUsage(db, lot.id)).toEqual({ sessionCount: 0, shotCount: 0 });
  });
});
