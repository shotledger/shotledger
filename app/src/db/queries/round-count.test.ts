import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addSeries, getSeries } from './series';
import { createSession } from './sessions';
import { createFirearm, getFirearm } from './firearms';
import { listShotsForSeries } from './shots';
import { applyRoundCountDelta, deleteSeriesAndShots, saveSeriesShots } from './round-count';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function shot(valueTenths: number) {
  return { valueTenths };
}

describe('saveSeriesShots — M4 round counter (§4 M4 "Done when")', () => {
  it('increments a firearm-linked session firearm round count for every shot, sighters included', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });

    const sighter = addSeries(db, { sessionId: session.id, position: 1, isSighter: true });
    saveSeriesShots(db, sighter.id, [shot(90), shot(90), shot(90), shot(90), shot(90)]);

    const scored = addSeries(db, { sessionId: session.id, position: 2 });
    saveSeriesShots(db, scored.id, [shot(100), shot(90), shot(80), shot(90), shot(100)]);

    // 5 sighter shots + 5 scored shots = 10 rounds, including the sighter series.
    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundCount).toBe(10);
    expect(updated?.roundsSinceMaintenance).toBe(10);
  });

  it('does not touch any firearm round count for a session with no firearm link', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s.id, [shot(90), shot(90)]);

    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it('adjusts by the delta (not the raw count) when a series is re-entered', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });

    saveSeriesShots(db, s.id, [shot(90), shot(90), shot(90), shot(90), shot(90)]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(5);

    // Re-entered with fewer shots (e.g. a correction): only the delta applies.
    saveSeriesShots(db, s.id, [shot(90), shot(90), shot(90)]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(3);

    // Re-entered with more shots than before.
    saveSeriesShots(db, s.id, [shot(90), shot(90), shot(90), shot(90), shot(90), shot(90)]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(6);
  });

  it('increments rounds_since_maintenance alongside the lifetime count', () => {
    const firearm = createFirearm(db, {
      make: 'A',
      model: '1',
      maintenanceIntervalRounds: 100,
    });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s.id, [shot(90), shot(90)]);

    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundsSinceMaintenance).toBe(2);
  });
});

describe('deleteSeriesAndShots', () => {
  it('soft-deletes the shots and the series, and backs the round count out', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s.id, [shot(90), shot(90), shot(90)]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(3);

    deleteSeriesAndShots(db, s.id);

    expect(getSeries(db, s.id)).toBeUndefined();
    expect(listShotsForSeries(db, s.id)).toHaveLength(0);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it('does not touch the round count for a session with no firearm link', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s.id, [shot(90), shot(90)]);

    deleteSeriesAndShots(db, s.id);

    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it('deletes an empty series without touching the round count', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });

    deleteSeriesAndShots(db, s.id);

    expect(getSeries(db, s.id)).toBeUndefined();
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });
});

describe('applyRoundCountDelta', () => {
  it('never lets counters go below zero', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, -10);
    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundCount).toBe(0);
    expect(updated?.roundsSinceMaintenance).toBe(0);
  });

  it('returns undefined for an unknown firearm', () => {
    expect(applyRoundCountDelta(db, 'missing', 5)).toBeUndefined();
  });
});
