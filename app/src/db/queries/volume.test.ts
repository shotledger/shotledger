// docs/specs/one-volume-figure-spec.md — the A-n tags are its scenarios.
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { sessions } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createAmmoLot } from './ammo-lots';
import { getAmmoLotUsage } from './ammo-usage';
import { addStation, softDeleteStation } from './falt';
import { createFirearm, getFirearm } from './firearms';
import { deleteSeriesAndShots, deleteSessionAndSeries, saveSeriesShots } from './round-count';
import { addSeries, softDeleteSeries } from './series';
import { createSession } from './sessions';
import { countVolumeRounds, listShotsForSeries, softDeleteShot } from './shots';
import {
  sessionVolumeRounds,
  sessionVolumes,
  totalVolumeRounds,
  totalVolumeRoundsFor,
  withSessionVolumeDelta,
} from './volume';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function session(options: { firearmId?: string; ammoLotId?: string; extraRounds?: number } = {}) {
  const row = createSession(db, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-05-01T10:00:00.000Z',
    firearmId: options.firearmId,
    ammoLotId: options.ammoLotId,
  });
  if (options.extraRounds !== undefined) {
    db.update(sessions)
      .set({ extraRounds: options.extraRounds })
      .where(eq(sessions.id, row.id))
      .run();
  }
  return row.id;
}

function shotSeries(sessionId: string, position: number, shotCount: number, isSighter = false) {
  const created = addSeries(db, { sessionId, position, isSighter });
  saveSeriesShots(
    db,
    created.id,
    Array.from({ length: shotCount }, () => ({ valueTenths: 90 })),
  );
  return created.id;
}

/** A total-only series, written the way the WebShooter importer writes one. */
function totalOnly(sessionId: string, position: number, shotCount: number | null) {
  return addSeries(db, {
    sessionId,
    position,
    isTotalOverride: true,
    totalOverrideTenths: 450,
    totalOverrideShotCount: shotCount,
  }).id;
}

function makeFirearm() {
  return createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
}

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_SCORE_010
 */
it('A1: a session’s volume counts shot rows, sighters, total-only series, extra rounds and stations', () => {
  const id = session({ extraRounds: 7 });
  shotSeries(id, 1, 5, true);
  shotSeries(id, 2, 5);
  totalOnly(id, 3, 10);
  totalOnly(id, 4, null);
  addStation(db, { sessionId: id, position: 1, hits: 5, figuresHit: 3 });
  addStation(db, { sessionId: id, position: 2, hits: 6, figuresHit: 0, isScratched: true });

  expect(sessionVolumeRounds(db, id)).toBe(5 + 5 + 10 + 0 + 7 + 12);
});

describe('sessionVolumes (A1)', () => {
  it('ignores deleted shots, series, stations and sessions', () => {
    const id = session();
    const kept = shotSeries(id, 1, 5);
    const goneSeries = shotSeries(id, 2, 5);
    softDeleteSeries(db, goneSeries);
    const goneOverride = totalOnly(id, 3, 5);
    softDeleteSeries(db, goneOverride);
    const station = addStation(db, { sessionId: id, position: 1, hits: 5, figuresHit: 3 });
    softDeleteStation(db, station.id);
    softDeleteShot(db, listShotsForSeries(db, kept)[0]!.id);

    const gone = session({ extraRounds: 50 });
    shotSeries(gone, 1, 5);
    deleteSessionAndSeries(db, gone);

    expect(sessionVolumes(db)).toEqual(new Map([[id, 4]]));
    expect(sessionVolumeRounds(db, gone)).toBe(0);
    expect(sessionVolumeRounds(db, 'no-such-session')).toBe(0);
  });

  it('keeps a session with nothing in it at 0', () => {
    const id = session();
    expect(sessionVolumes(db)).toEqual(new Map([[id, 0]]));
  });

  it('sums only the sessions asked for', () => {
    const a = session({ extraRounds: 3 });
    const b = session({ extraRounds: 4 });
    session({ extraRounds: 100 });
    expect(totalVolumeRoundsFor(db, [a, b])).toBe(7);
    expect(totalVolumeRoundsFor(db, [a, 'unknown'])).toBe(3);
    expect(totalVolumeRoundsFor(db, [])).toBe(0);
    expect(totalVolumeRounds(db)).toBe(107);
  });
});

describe('every figure counts a total-only series (A2–A4)', () => {
  it('A2: Home Shots Logged', () => {
    const id = session();
    shotSeries(id, 1, 5);
    for (let position = 2; position <= 7; position += 1) totalOnly(id, position, 5);
    expect(countVolumeRounds(db)).toBe(35);
  });

  it('A3: ammo lot usage', () => {
    const lot = createAmmoLot(db, { label: 'Lot' }).id;
    const other = createAmmoLot(db, { label: 'Other' }).id;
    const id = session({ ammoLotId: lot, extraRounds: 2 });
    shotSeries(id, 1, 5, true);
    totalOnly(id, 2, 5);
    totalOnly(session({ ammoLotId: other }), 1, 5);
    expect(getAmmoLotUsage(db, lot)).toEqual({ sessionCount: 1, shotCount: 12 });
  });

  it('A4: the shooting log’s sessions — sighters, extra rounds, total-only series and stations', () => {
    const id = session({ extraRounds: 4 });
    shotSeries(id, 1, 5, true);
    shotSeries(id, 2, 5);
    totalOnly(id, 3, 5);
    addStation(db, { sessionId: id, position: 1, hits: 5, figuresHit: 3 });
    expect(totalVolumeRoundsFor(db, [id])).toBe(4 + 5 + 5 + 5 + 6);
  });
});

describe('the firearm counter follows the session volume (A5–A6)', () => {
  it('A6: deleting a total-only series backs its count out of the counter', () => {
    const firearmId = makeFirearm();
    const id = session({ firearmId });
    shotSeries(id, 1, 5);
    const imported = withSessionVolumeDelta(db, id, () => totalOnly(id, 2, 5));
    expect(getFirearm(db, firearmId)!.roundCount).toBe(10);

    deleteSeriesAndShots(db, imported);

    expect(getFirearm(db, firearmId)!.roundCount).toBe(5);
  });

  it('A5: deleting a session backs out its whole volume, total-only series included', () => {
    const firearmId = makeFirearm();
    const other = makeFirearm();
    shotSeries(session({ firearmId: other }), 1, 3);
    const id = session({ firearmId });
    shotSeries(id, 1, 5, true);
    addStation(db, { sessionId: id, position: 1, hits: 5, figuresHit: 3 });
    withSessionVolumeDelta(db, id, () => totalOnly(id, 2, 5));
    expect(getFirearm(db, firearmId)!.roundCount).toBe(16);

    deleteSessionAndSeries(db, id);

    expect(getFirearm(db, firearmId)!.roundCount).toBe(0);
    expect(getFirearm(db, firearmId)!.roundsSinceMaintenance).toBe(0);
    expect(getFirearm(db, other)!.roundCount).toBe(3);
  });

  it('A5: a session with no firearm moves no counter', () => {
    const firearmId = makeFirearm();
    const id = session();
    expect(withSessionVolumeDelta(db, id, () => totalOnly(id, 1, 5))).toEqual(expect.any(String));
    expect(getFirearm(db, firearmId)!.roundCount).toBe(0);
  });
});
