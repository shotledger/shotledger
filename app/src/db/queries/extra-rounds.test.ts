// Unscored extra rounds (spec Amendment A1 §A1.3, scenarios A-X1..A-X9).
// Extra rounds are FAP/ammo bookkeeping: they move the firearm round counter,
// ammo-lot usage and volume totals, and they touch nothing that scores.
import { beforeEach, describe, expect, it } from 'vitest';
import { meanTenths, scoredShots, volumeShotCount, xCount } from '@shotledger/shared';

import { series as seriesTable, shots as shotsTable } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createAmmoLot } from './ammo-lots';
import { getAmmoLotUsage } from './ammo-usage';
import { createFirearm, getFirearm } from './firearms';
import { setSessionExtraRounds } from './round-count';
import { addSeries } from './series';
import { createSession, getSession, sumExtraRounds } from './sessions';
import { addShot, countAllShots, countVolumeRounds } from './shots';
import { listAllStatsSeries } from './stats';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function session(overrides: { firearmId?: string; ammoLotId?: string } = {}) {
  return createSession(db, {
    name: 'Test',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  });
}

/** Five scored shots in one non-sighter series. */
function scoredSeries(sessionId: string, values: number[], position = 1) {
  const row = addSeries(db, { sessionId, position });
  values.forEach((valueTenths, index) =>
    addShot(db, { seriesId: row.id, position: index + 1, valueTenths }),
  );
  return row;
}

describe('A-X1: extra rounds count toward the firearm round counter', () => {
  it('adds the entered rounds to a firearm-linked session', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const s = session({ firearmId: firearm.id });

    setSessionExtraRounds(db, s.id, 12);

    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundCount).toBe(12);
    expect(updated?.roundsSinceMaintenance).toBe(12);
  });

  it('adds on top of the shots already counted by saveSeriesShots', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const s = session({ firearmId: firearm.id });
    scoredSeries(s.id, [90, 90, 90, 90, 90]);
    // addShot alone does not move the counter; use the round-count path.
    setSessionExtraRounds(db, s.id, 7);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(7);
  });

  it('leaves every firearm alone for a session with no firearm link', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const s = session();
    setSessionExtraRounds(db, s.id, 25);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
    expect(getSession(db, s.id)?.extraRounds).toBe(25);
  });
});

describe('A-X6: editing extra rounds moves the counter by the delta', () => {
  it('applies only the difference when the value is corrected', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const s = session({ firearmId: firearm.id });

    setSessionExtraRounds(db, s.id, 20);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(20);

    setSessionExtraRounds(db, s.id, 5);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(5);

    setSessionExtraRounds(db, s.id, 30);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(30);
  });

  it('clearing the field back to null removes the rounds it had added', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const s = session({ firearmId: firearm.id });

    setSessionExtraRounds(db, s.id, 8);
    setSessionExtraRounds(db, s.id, null);

    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
    expect(getSession(db, s.id)?.extraRounds).toBeNull();
  });
});

describe('A-X7/A-X8: value rules', () => {
  it('treats null and 0 alike as "no extra rounds"', () => {
    const s = session();
    setSessionExtraRounds(db, s.id, 0);
    expect(getSession(db, s.id)?.extraRounds).toBe(0);
    expect(sumExtraRounds(db)).toBe(0);
  });

  it('rejects negative and non-integer values instead of mis-counting rounds', () => {
    const s = session();
    expect(() => setSessionExtraRounds(db, s.id, -1)).toThrow(RangeError);
    expect(() => setSessionExtraRounds(db, s.id, 2.5)).toThrow(RangeError);
    expect(getSession(db, s.id)?.extraRounds).toBeNull();
  });

  it('is a no-op for an unknown session', () => {
    expect(setSessionExtraRounds(db, 'missing', 5)).toBeUndefined();
  });
});

describe('A-X5: extra rounds create no series and no shots', () => {
  it('writes nothing into the series or shots tables', () => {
    const s = session();
    setSessionExtraRounds(db, s.id, 40);
    expect(db.select().from(seriesTable).all()).toHaveLength(0);
    expect(db.select().from(shotsTable).all()).toHaveLength(0);
  });
});

describe('A-X4: extra rounds are excluded from every score statistic', () => {
  it('leaves mean, X count, scored-shot set and series structure untouched', () => {
    const s = session();
    scoredSeries(s.id, [100, 90, 90, 80, 80]);
    addShot(db, { seriesId: addSeries(db, { sessionId: s.id, position: 2 }).id, position: 1, valueTenths: 100, isInnerTen: true });

    const before = listAllStatsSeries(db);
    const beforeMean = meanTenths(scoredShots(before));
    const beforeX = xCount(scoredShots(before));

    setSessionExtraRounds(db, s.id, 100);

    const after = listAllStatsSeries(db);
    expect(after).toHaveLength(before.length);
    expect(scoredShots(after)).toHaveLength(scoredShots(before).length);
    expect(meanTenths(scoredShots(after))).toBe(beforeMean);
    expect(xCount(scoredShots(after))).toBe(beforeX);
  });

  it('does not change the volume shot count derived from series (a score-side metric input)', () => {
    const s = session();
    scoredSeries(s.id, [90, 90]);
    const before = volumeShotCount(listAllStatsSeries(db));
    setSessionExtraRounds(db, s.id, 50);
    expect(volumeShotCount(listAllStatsSeries(db))).toBe(before);
  });
});

describe('A-X3: extra rounds count toward volume totals', () => {
  it('countVolumeRounds adds them to the logged shots', () => {
    const s1 = session();
    scoredSeries(s1.id, [90, 90, 90]);
    const s2 = session();
    setSessionExtraRounds(db, s2.id, 17);

    expect(countAllShots(db)).toBe(3);
    expect(sumExtraRounds(db)).toBe(17);
    expect(countVolumeRounds(db)).toBe(20);
  });

  it('sumExtraRounds can be restricted to a set of sessions (the stats-tab filter)', () => {
    const s1 = session();
    const s2 = session();
    setSessionExtraRounds(db, s1.id, 4);
    setSessionExtraRounds(db, s2.id, 6);

    expect(sumExtraRounds(db)).toBe(10);
    expect(sumExtraRounds(db, [s1.id])).toBe(4);
    expect(sumExtraRounds(db, [])).toBe(0);
  });
});

describe('A-X2: extra rounds count toward ammo-lot usage', () => {
  it('adds them to the lot shot count', () => {
    const lot = createAmmoLot(db, { label: 'Lot' });
    const otherLot = createAmmoLot(db, { label: 'Other' });
    const s = session({ ammoLotId: lot.id });
    scoredSeries(s.id, [90, 90]);
    setSessionExtraRounds(db, s.id, 8);

    const other = session({ ammoLotId: otherLot.id });
    setSessionExtraRounds(db, other.id, 3);

    expect(getAmmoLotUsage(db, lot.id)).toEqual({ sessionCount: 1, shotCount: 10 });
    expect(getAmmoLotUsage(db, otherLot.id)).toEqual({ sessionCount: 1, shotCount: 3 });
  });
});
