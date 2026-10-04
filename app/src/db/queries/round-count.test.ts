import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addSeries, getSeries } from './series';
import { createSession, getSession, updateSession } from './sessions';
import { createFirearm, getFirearm } from './firearms';
import { listShotsForSeries } from './shots';
import {
  applyRoundCountDelta,
  deleteSeriesAndShots,
  deleteSessionAndSeries,
  saveSeriesShots,
  setSessionExtraRounds,
} from './round-count';

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

describe('deleteSessionAndSeries', () => {
  it('soft-deletes the session, its series and their shots, and backs the round count out', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    const s1 = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s1.id, [shot(90), shot(90), shot(90)]);
    const s2 = addSeries(db, { sessionId: session.id, position: 2 });
    saveSeriesShots(db, s2.id, [shot(100), shot(90)]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(5);

    deleteSessionAndSeries(db, session.id);

    expect(getSession(db, session.id)).toBeUndefined();
    expect(getSeries(db, s1.id)).toBeUndefined();
    expect(getSeries(db, s2.id)).toBeUndefined();
    expect(listShotsForSeries(db, s1.id)).toHaveLength(0);
    expect(listShotsForSeries(db, s2.id)).toHaveLength(0);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it("also backs out the session's own unscored extra rounds", () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: new Date().toISOString(),
    });
    setSessionExtraRounds(db, session.id, 20);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(20);

    deleteSessionAndSeries(db, session.id);

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

    deleteSessionAndSeries(db, session.id);

    expect(getSession(db, session.id)).toBeUndefined();
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it('is a no-op for an unknown or already-deleted session id', () => {
    expect(() => deleteSessionAndSeries(db, 'missing')).not.toThrow();
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

describe('updateSession — changing the firearm moves the rounds (#564)', () => {
  function sessionWithRounds(firearmId: string | null) {
    const session = createSession(db, {
      name: 'Test',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId,
      startedAt: new Date().toISOString(),
    });
    const s = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, s.id, [shot(90), shot(90), shot(90)]);
    // A total-only series counts too: its stored five shots.
    addSeries(db, {
      sessionId: session.id,
      position: 2,
      isTotalOverride: true,
      totalOverrideTenths: 450,
      totalOverrideShotCount: 5,
    });
    setSessionExtraRounds(db, session.id, 2);
    return session;
  }

  function counters(id: string) {
    const f = getFirearm(db, id);
    return [f?.roundCount, f?.roundsSinceMaintenance];
  }

  it('takes the rounds off the old firearm and puts them on the new one', () => {
    const oldFirearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const newFirearm = createFirearm(db, { make: 'Walther', model: 'GSP' });
    const session = sessionWithRounds(oldFirearm.id);
    // saveSeriesShots and setSessionExtraRounds moved 3 + 2; addSeries does
    // not move a counter, so the total-only series' 5 are added by hand.
    applyRoundCountDelta(db, oldFirearm.id, 5);
    expect(counters(oldFirearm.id)).toEqual([10, 10]);

    updateSession(db, session.id, { firearmId: newFirearm.id });

    expect(counters(oldFirearm.id)).toEqual([0, 0]);
    expect(counters(newFirearm.id)).toEqual([10, 10]);
  });

  it('only takes them off when the firearm is cleared', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const session = sessionWithRounds(firearm.id);
    applyRoundCountDelta(db, firearm.id, 5);

    updateSession(db, session.id, { firearmId: null });

    expect(counters(firearm.id)).toEqual([0, 0]);
  });

  it('only puts them on when a session gets its first firearm', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const session = sessionWithRounds(null);

    updateSession(db, session.id, { firearmId: firearm.id });

    expect(counters(firearm.id)).toEqual([10, 10]);
  });

  it('moves nothing when the firearm is saved unchanged or not in the patch', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'K22' });
    const session = sessionWithRounds(firearm.id);

    updateSession(db, session.id, { firearmId: firearm.id, name: 'Renamed' });
    updateSession(db, session.id, { name: 'Again' });

    expect(counters(firearm.id)).toEqual([5, 5]);
  });
});
