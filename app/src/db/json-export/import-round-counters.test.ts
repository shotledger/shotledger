// #350: an import used to create sessions without moving the linked firearm's
// round counters, so Rounds Fired and every maintenance interval read zero for
// the shooter with the most history (11,615 attributed shots on the real-data
// pass). Logging a session in the app moves them; importing one now does too.
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import { wipeDemoData } from '../seed';
import { addStation } from '../queries/falt';
import { applyRoundCountDelta } from '../queries/round-count';
import { createFirearm, getFirearm } from '../queries/firearms';
import { addSeries } from '../queries/series';
import { createSession } from '../queries/sessions';
import { addShot } from '../queries/shots';
import { firearms, series, sessionTags, sessions, shots } from '../schema';
import type { Database } from '../types';
import { buildExportJson } from './build-export';
import { applyImport, dryRunImport } from './apply-import';

function makeFirearm(db: Database) {
  return createFirearm(db, {
    make: 'Pardini',
    model: 'SP',
    weaponType: 'pistol',
    caliber: '.22 LR',
    serialNumber: 'SN-0001',
    vapenId: 'SE-TEST-0001',
    loadSystem: 'halvautomat',
    isOwn: true,
    maintenanceIntervalRounds: 500,
  });
}

/** A session with `shotCount` shots in one series, optionally firearm-linked. */
function makeSession(
  db: Database,
  options: { firearmId?: string; shotCount: number; extraRounds?: number; startedAt?: string },
) {
  const session = createSession(db, {
    name: 'Träning',
    type: 'training',
    disciplineId: 'precision',
    firearmId: options.firearmId,
    startedAt: options.startedAt ?? '2026-08-01T18:00:00.000Z',
    decimalScoring: false,
  });
  if (options.shotCount > 0) {
    const row = addSeries(db, { sessionId: session.id, position: 1 });
    for (let i = 1; i <= options.shotCount; i += 1) {
      addShot(db, { seriesId: row.id, position: i, valueTenths: 90 });
    }
  }
  if (options.extraRounds !== undefined) {
    db.update(sessions)
      .set({ extraRounds: options.extraRounds })
      .where(eq(sessions.id, session.id))
      .run();
  }
  return session;
}

/** Everything the import recreates, so the next import is a fresh create. */
function wipeSessions(db: Database) {
  for (const table of [shots, series, sessionTags, sessions]) db.delete(table).run();
}

/** Resets the counters the seeding itself moved, so a test starts from zero. */
function zeroCounters(db: Database, firearmId: string) {
  db.update(firearms)
    .set({ roundCount: 0, roundsSinceMaintenance: 0 })
    .where(eq(firearms.id, firearmId))
    .run();
}

function counters(db: Database, firearmId: string) {
  const firearm = getFirearm(db, firearmId);
  return {
    roundCount: firearm?.roundCount,
    roundsSinceMaintenance: firearm?.roundsSinceMaintenance,
  };
}

function reimport(db: Database, json: string) {
  const { errors, groups } = dryRunImport(db, json);
  expect(errors).toEqual([]);
  applyImport(db, groups);
}

describe('import moves the linked firearm round counters (#350)', () => {
  it('RC-1: a created session adds its shots to both counters', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    makeSession(db, { firearmId: firearm.id, shotCount: 7 });
    const json = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, json);

    expect(counters(db, firearm.id)).toEqual({ roundCount: 7, roundsSinceMaintenance: 7 });
  });

  it('RC-2: unscored extra rounds count as well', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    makeSession(db, { firearmId: firearm.id, shotCount: 5, extraRounds: 12 });
    const json = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, json);

    expect(counters(db, firearm.id)).toEqual({ roundCount: 17, roundsSinceMaintenance: 17 });
  });

  it('RC-3: every session in the file contributes, not just the first', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    makeSession(db, { firearmId: firearm.id, shotCount: 5, startedAt: '2026-08-01T10:00:00.000Z' });
    makeSession(db, { firearmId: firearm.id, shotCount: 6, startedAt: '2026-08-02T10:00:00.000Z' });
    const json = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, json);

    expect(counters(db, firearm.id)).toEqual({ roundCount: 11, roundsSinceMaintenance: 11 });
  });

  it('RC-4: re-importing the same file changes nothing — the move is a delta', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    makeSession(db, { firearmId: firearm.id, shotCount: 7, extraRounds: 3 });
    const json = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, json);
    const afterFirst = counters(db, firearm.id);

    reimport(db, json);
    reimport(db, json);

    expect(counters(db, firearm.id)).toEqual(afterFirst);
    expect(afterFirst).toEqual({ roundCount: 10, roundsSinceMaintenance: 10 });
  });

  it('RC-5: importing over a session that grew moves the counter by the difference', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    const session = makeSession(db, { firearmId: firearm.id, shotCount: 4 });
    const small = buildExportJson(db, '1.0.0');

    // The same session, two shots longer, exported again.
    const row = addSeries(db, { sessionId: session.id, position: 2 });
    addShot(db, { seriesId: row.id, position: 1, valueTenths: 90 });
    addShot(db, { seriesId: row.id, position: 2, valueTenths: 90 });
    const big = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, small);
    expect(counters(db, firearm.id)).toEqual({ roundCount: 4, roundsSinceMaintenance: 4 });

    reimport(db, big);
    expect(counters(db, firearm.id)).toEqual({ roundCount: 6, roundsSinceMaintenance: 6 });
  });

  it('RC-6: importing over a session that shrank backs the difference out', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    const session = makeSession(db, { firearmId: firearm.id, shotCount: 4 });
    const small = buildExportJson(db, '1.0.0');

    const row = addSeries(db, { sessionId: session.id, position: 2 });
    addShot(db, { seriesId: row.id, position: 1, valueTenths: 90 });
    addShot(db, { seriesId: row.id, position: 2, valueTenths: 90 });
    const big = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, big);
    expect(counters(db, firearm.id)).toEqual({ roundCount: 6, roundsSinceMaintenance: 6 });

    reimport(db, small);
    expect(counters(db, firearm.id)).toEqual({ roundCount: 4, roundsSinceMaintenance: 4 });
  });

  it('RC-7: a session with no firearm moves nothing', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    makeSession(db, { shotCount: 9, extraRounds: 4 });
    const json = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, json);

    expect(counters(db, firearm.id)).toEqual({ roundCount: 0, roundsSinceMaintenance: 0 });
  });

  it('RC-8: a counter the import would drive negative stops at zero', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    const session = makeSession(db, { firearmId: firearm.id, shotCount: 4 });
    const small = buildExportJson(db, '1.0.0');

    const row = addSeries(db, { sessionId: session.id, position: 2 });
    addShot(db, { seriesId: row.id, position: 1, valueTenths: 90 });
    const big = buildExportJson(db, '1.0.0');

    wipeSessions(db);
    zeroCounters(db, firearm.id);
    reimport(db, big);
    // Zero the counters behind the import's back, so backing 5 out and adding
    // 4 would land at -1 if the floor were not there.
    zeroCounters(db, firearm.id);
    reimport(db, small);

    expect(counters(db, firearm.id)).toEqual({ roundCount: 0, roundsSinceMaintenance: 0 });
  });
});

/** Exports, empties the database, and imports the file with its firearms. */
function restore(db: Database, json: string) {
  wipeDemoData(db);
  reimportWithRecords(db, json);
}

function reimportWithRecords(db: Database, json: string) {
  const { errors, groups, records } = dryRunImport(db, json);
  expect(errors).toEqual([]);
  applyImport(db, groups, records);
}

/** A ring session, its rounds credited as logging it in the app would. */
function logRingSession(db: Database, firearmId: string, shotCount: number, extraRounds: number) {
  makeSession(db, { firearmId, shotCount, extraRounds });
  applyRoundCountDelta(db, firearmId, shotCount + extraRounds);
}

/** A firearm with history before this device, so the two counters differ. */
function makeFirearmWithHistory(db: Database) {
  return createFirearm(db, {
    make: 'Glock',
    model: '17',
    caliber: '9 mm',
    roundCount: 1200,
    maintenanceIntervalRounds: 500,
    roundsSinceMaintenance: 120,
  });
}

describe("a full restore keeps the file's firearm counters (#511)", () => {
  it('RC-9: a ring session is not counted on top of the restored counters', () => {
    const db = createTestDb();
    const firearm = makeFirearmWithHistory(db);
    logRingSession(db, firearm.id, 7, 3);
    const original = counters(db, firearm.id);
    expect(original).toEqual({ roundCount: 1210, roundsSinceMaintenance: 130 });

    restore(db, buildExportJson(db, '1.0.0'));

    expect(counters(db, firearm.id)).toEqual(original);
  });

  it('RC-10: a fält session is not counted on top of the restored counters', () => {
    const db = createTestDb();
    const firearm = makeFirearmWithHistory(db);
    const session = createSession(db, {
      name: 'Kretsfält',
      type: 'competition',
      disciplineId: 'spsf-falt',
      firearmId: firearm.id,
      startedAt: '2026-05-10T09:00:00.000Z',
      faltResultMode: 'falt',
    });
    addStation(db, { sessionId: session.id, position: 1, hits: 5, figuresHit: 3 });
    addStation(db, { sessionId: session.id, position: 2, hits: 6, figuresHit: 4 });
    const original = counters(db, firearm.id);
    expect(original).toEqual({ roundCount: 1212, roundsSinceMaintenance: 132 });

    restore(db, buildExportJson(db, '1.0.0'));

    expect(counters(db, firearm.id)).toEqual(original);
  });

  it('RC-11: importing the same file twice after a restore changes nothing', () => {
    const db = createTestDb();
    const firearm = makeFirearmWithHistory(db);
    logRingSession(db, firearm.id, 7, 3);
    const original = counters(db, firearm.id);
    const json = buildExportJson(db, '1.0.0');

    restore(db, json);
    reimportWithRecords(db, json);
    reimportWithRecords(db, json);

    expect(counters(db, firearm.id)).toEqual(original);
  });

  it('RC-12: a name-matched firearm keeps its own counter and moves by the difference', () => {
    const db = createTestDb();
    const firearm = makeFirearmWithHistory(db);
    logRingSession(db, firearm.id, 7, 0);
    const json = buildExportJson(db, '1.0.0');

    // Another device: the same gun under a different id, with its own count.
    wipeDemoData(db);
    const local = createFirearm(db, { make: 'Glock', model: '17', roundCount: 50 });
    reimportWithRecords(db, json);
    reimportWithRecords(db, json);

    expect(counters(db, local.id)).toEqual({ roundCount: 57, roundsSinceMaintenance: 7 });
    expect(getFirearm(db, firearm.id)).toBeUndefined();
  });
});

describe('the import counts volume by the one rule (one-volume-figure-spec A9)', () => {
  it('A9: importing over a session takes its total-only series into the before figure', () => {
    const db = createTestDb();
    const firearm = makeFirearm(db);
    const session = makeSession(db, { firearmId: firearm.id, shotCount: 4, extraRounds: 2 });
    const json = buildExportJson(db, '1.0.0');
    // A WebShooter-style total-only series the file cannot carry.
    addSeries(db, {
      sessionId: session.id,
      position: 2,
      isTotalOverride: true,
      totalOverrideTenths: 450,
      totalOverrideShotCount: 5,
    });
    zeroCounters(db, firearm.id);
    applyRoundCountDelta(db, firearm.id, 11);

    reimport(db, json);

    // Before: 4 shots + 2 extra + 5 total-only = 11. After: the file's 4 + 2.
    expect(counters(db, firearm.id)).toEqual({ roundCount: 6, roundsSinceMaintenance: 6 });
  });
});
