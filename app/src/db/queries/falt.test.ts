import { beforeEach, describe, expect, it } from 'vitest';

import { createAmmoLot } from './ammo-lots';
import { getAmmoLotUsage } from './ammo-usage';
import { createFirearm, getFirearm } from './firearms';
import { deleteSessionAndSeries } from './round-count';
import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addStation,
  faltSessionResult,
  getStation,
  listStationsForSession,
  softDeleteStation,
  stationRoundsForSession,
  updateStation,
} from './falt';
import { countVolumeRounds } from './shots';

let db: Database;
let sessionId: string;

beforeEach(() => {
  db = createTestDb();
  sessionId = createSession(db, {
    name: 'Kretsfält',
    type: 'competition',
    disciplineId: 'spsf-falt',
    startedAt: '2026-01-01T00:00:00.000Z',
  }).id;
});

describe('addStation / listStationsForSession (spec P2)', () => {
  it('P2a: round-trips a station, keeping points null distinct from 0', () => {
    addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId, position: 2, hits: 6, figuresHit: 2, points: 0, pointsMax: 10 });

    const [first, second] = listStationsForSession(db, sessionId);
    expect(first).toMatchObject({
      position: 1,
      hits: 5,
      figuresHit: 3,
      points: null,
      pointsMax: null,
      isScratched: 0,
      isShootOff: 0,
    });
    // A poängmål that scored nothing is still a poängmål.
    expect(second).toMatchObject({ position: 2, points: 0, pointsMax: 10 });
  });

  it('P2b: lists in station order, whatever order they were entered', () => {
    addStation(db, { sessionId, position: 3, hits: 1, figuresHit: 1 });
    addStation(db, { sessionId, position: 1, hits: 2, figuresHit: 2 });
    addStation(db, { sessionId, position: 2, hits: 3, figuresHit: 2 });
    expect(listStationsForSession(db, sessionId).map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('P2c: refuses numbers no station can have, naming the station', () => {
    expect(() => addStation(db, { sessionId, position: 1, hits: 7, figuresHit: 1 })).toThrow(
      RangeError,
    );
    expect(() => addStation(db, { sessionId, position: 1, hits: 3, figuresHit: 4 })).toThrow(
      RangeError,
    );
    expect(() => addStation(db, { sessionId, position: 1, hits: 4, figuresHit: 0 })).toThrow(
      RangeError,
    );
    // ...unless it is struck out: what was annulled never has to be possible.
    expect(() =>
      addStation(db, { sessionId, position: 1, hits: 6, figuresHit: 0, isScratched: true }),
    ).not.toThrow();
  });

  it('P2d: a soft-deleted station leaves the list and the result', () => {
    const kept = addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
    const gone = addStation(db, { sessionId, position: 2, hits: 6, figuresHit: 2 });
    softDeleteStation(db, gone.id);

    expect(listStationsForSession(db, sessionId).map((s) => s.id)).toEqual([kept.id]);
    expect(getStation(db, gone.id)).toBeUndefined();
    expect(faltSessionResult(db, sessionId).hits).toBe(5);
  });
});

describe('updateStation', () => {
  it('patches the numbers and the flags, bumping updated_at', () => {
    const row = addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
    const patched = updateStation(db, row.id, { hits: 6, figuresHit: 2, isScratched: true });
    expect(patched).toMatchObject({ hits: 6, figuresHit: 2, isScratched: 1 });
    expect(patched!.updatedAt >= row.updatedAt).toBe(true);
  });

  it('refuses an impossible patch to a station that still scores', () => {
    const row = addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
    expect(() => updateStation(db, row.id, { figuresHit: 6 })).toThrow(RangeError);
    // Unchanged after the refusal.
    expect(getStation(db, row.id)).toMatchObject({ hits: 5, figuresHit: 3 });
  });
});

describe('faltSessionResult (spec P3)', () => {
  it('P3: counts neither the scratched station nor the särskjutning', () => {
    addStation(db, { sessionId, position: 1, hits: 6, figuresHit: 2, points: 8, pointsMax: 10 });
    addStation(db, { sessionId, position: 2, hits: 5, figuresHit: 4, isScratched: true });
    addStation(db, { sessionId, position: 3, hits: 4, figuresHit: 3 });
    addStation(db, { sessionId, position: 4, hits: 6, figuresHit: 6, isShootOff: true });

    expect(faltSessionResult(db, sessionId)).toEqual({
      stationCount: 2,
      hits: 10,
      figuresHit: 5,
      ringedFigurePoints: 8,
      poangfaltPoints: 15,
      pointsMax: 10,
    });
  });

  it('a session with no stations is a zero result, not a crash', () => {
    expect(faltSessionResult(db, sessionId)).toEqual({
      stationCount: 0,
      hits: 0,
      figuresHit: 0,
      ringedFigurePoints: null,
      poangfaltPoints: 0,
      pointsMax: null,
    });
  });
});

describe('stations are volume, even when they are not score (spec P6, P7)', () => {
  it('P6a: each station adds its six rounds to the firearm counter, scratched included', () => {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'SP' });
    const faltSession = createSession(db, {
      name: 'Fält',
      type: 'competition',
      disciplineId: 'spsf-falt',
      startedAt: '2026-02-01T00:00:00.000Z',
      firearmId: firearm.id,
    }).id;

    addStation(db, { sessionId: faltSession, position: 1, hits: 5, figuresHit: 3 });
    // Struck out: its rounds were still fired down the barrel.
    addStation(db, {
      sessionId: faltSession,
      position: 2,
      hits: 6,
      figuresHit: 0,
      isScratched: true,
    });

    expect(getFirearm(db, firearm.id)!.roundCount).toBe(12);
    expect(getFirearm(db, firearm.id)!.roundsSinceMaintenance).toBe(12);
  });

  it('P6b: an ammo lot counts a station’s rounds too', () => {
    const lot = createAmmoLot(db, { label: 'Lot A', caliber: '.22 LR' });
    const faltSession = createSession(db, {
      name: 'Fält',
      type: 'competition',
      disciplineId: 'spsf-falt',
      startedAt: '2026-02-01T00:00:00.000Z',
      ammoLotId: lot.id,
    }).id;
    addStation(db, { sessionId: faltSession, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId: faltSession, position: 2, hits: 4, figuresHit: 2 });

    expect(getAmmoLotUsage(db, lot.id)).toEqual({ sessionCount: 1, shotCount: 12 });
  });

  it('P6c: deleting a station backs its rounds out again', () => {
    const firearm = createFirearm(db, { make: 'Walther', model: 'GSP' });
    const faltSession = createSession(db, {
      name: 'Fält',
      type: 'competition',
      disciplineId: 'spsf-falt',
      startedAt: '2026-02-01T00:00:00.000Z',
      firearmId: firearm.id,
    }).id;
    const station = addStation(db, { sessionId: faltSession, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId: faltSession, position: 2, hits: 4, figuresHit: 2 });

    softDeleteStation(db, station.id);
    expect(getFirearm(db, firearm.id)!.roundCount).toBe(6);
  });

  it('P7: deleting a session takes its stations and their rounds with it', () => {
    const firearm = createFirearm(db, { make: 'Sig', model: 'P210' });
    const faltSession = createSession(db, {
      name: 'Fält',
      type: 'competition',
      disciplineId: 'spsf-falt',
      startedAt: '2026-02-01T00:00:00.000Z',
      firearmId: firearm.id,
    }).id;
    addStation(db, { sessionId: faltSession, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId: faltSession, position: 2, hits: 4, figuresHit: 2 });

    deleteSessionAndSeries(db, faltSession);

    expect(listStationsForSession(db, faltSession)).toEqual([]);
    expect(getFirearm(db, firearm.id)!.roundCount).toBe(0);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_006
 */
it('V1: shots logged counts six rounds per live station, scratched and särskjutning included', () => {
  addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
  addStation(db, { sessionId, position: 2, hits: 6, figuresHit: 0, isScratched: true });
  const gone = addStation(db, { sessionId, position: 3, hits: 4, figuresHit: 2 });
  addStation(db, { sessionId, position: 4, hits: 4, figuresHit: 2, isShootOff: true });
  softDeleteStation(db, gone.id);

  expect(countVolumeRounds(db)).toBe(18);
});

describe('station rounds reach every volume figure (falt-consumers-spec V2)', () => {
  it('V2: a session’s station rounds, live stations only', () => {
    const other = createSession(db, {
      name: 'Annat',
      type: 'training',
      disciplineId: 'spsf-falt',
      startedAt: '2026-03-01T00:00:00.000Z',
    }).id;
    addStation(db, { sessionId, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId, position: 2, hits: 6, figuresHit: 0, isScratched: true });
    const gone = addStation(db, { sessionId, position: 3, hits: 4, figuresHit: 2 });
    softDeleteStation(db, gone.id);
    addStation(db, { sessionId: other, position: 1, hits: 1, figuresHit: 1 });

    expect(stationRoundsForSession(db, sessionId)).toBe(12);
    expect(stationRoundsForSession(db, other)).toBe(6);
  });
});
