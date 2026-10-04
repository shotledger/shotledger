// docs/specs/falt-consumers-spec.md J1–J5: a fält session's stations and
// result mode survive a JSON export and import.
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import { addStation, listStationsForSession } from '../queries/falt';
import { createFirearm, getFirearm } from '../queries/firearms';
import { createSession, getSession } from '../queries/sessions';
import { faltStations, firearms, sessions } from '../schema';
import type { Database } from '../types';
import { buildExportJson, buildSessionExports } from './build-export';
import { applyImport, dryRunImport } from './apply-import';

function seedFalt(db: Database) {
  const firearm = createFirearm(db, { make: 'Glock', model: '17', caliber: '9 mm' });
  const session = createSession(db, {
    name: 'Kretsfält',
    type: 'competition',
    disciplineId: 'spsf-falt',
    firearmId: firearm.id,
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    startedAt: '2026-05-10T09:00:00.000Z',
    faltResultMode: 'poangfalt',
  });
  addStation(db, { sessionId: session.id, position: 1, hits: 5, figuresHit: 3, note: 'vind' });
  addStation(db, {
    sessionId: session.id,
    position: 2,
    hits: 6,
    figuresHit: 4,
    figureCount: 5,
    points: 8,
    pointsMax: 10,
  });
  addStation(db, { sessionId: session.id, position: 3, hits: 6, figuresHit: 0, isScratched: true });
  addStation(db, { sessionId: session.id, position: 4, hits: 4, figuresHit: 2, isShootOff: true });
  return { firearm, session };
}

function stationFields(db: Database, sessionId: string) {
  return listStationsForSession(db, sessionId).map((s) => ({
    position: s.position,
    hits: s.hits,
    figuresHit: s.figuresHit,
    figureCount: s.figureCount,
    points: s.points,
    pointsMax: s.pointsMax,
    isScratched: s.isScratched,
    isShootOff: s.isShootOff,
    note: s.note,
  }));
}

function wipe(db: Database) {
  for (const table of [faltStations, sessions, firearms]) db.delete(table).run();
}

const EXPECTED_STATIONS = [
  {
    position: 1,
    hits: 5,
    figuresHit: 3,
    figureCount: null,
    points: null,
    pointsMax: null,
    isScratched: false,
    isShootOff: false,
    note: 'vind',
  },
  {
    position: 2,
    hits: 6,
    figuresHit: 4,
    figureCount: 5,
    points: 8,
    pointsMax: 10,
    isScratched: false,
    isShootOff: false,
    note: null,
  },
  {
    position: 3,
    hits: 6,
    figuresHit: 0,
    figureCount: null,
    points: null,
    pointsMax: null,
    isScratched: true,
    isShootOff: false,
    note: null,
  },
  {
    position: 4,
    hits: 4,
    figuresHit: 2,
    figureCount: null,
    points: null,
    pointsMax: null,
    isScratched: false,
    isShootOff: true,
    note: null,
  },
];

describe('fält stations in the JSON export', () => {
  it('J1: exports every station, in order, with the result mode', () => {
    const db = createTestDb();
    seedFalt(db);
    const [exported] = buildSessionExports(db);
    expect(exported?.faltResultMode).toBe('poangfalt');
    expect(exported?.stations).toEqual(EXPECTED_STATIONS);
  });

  it('J2: a ring session exports no stations and no result mode', () => {
    const db = createTestDb();
    createSession(db, {
      name: 'Precision',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    const [exported] = buildSessionExports(db);
    expect(exported?.stations).toEqual([]);
    expect(exported?.faltResultMode).toBeNull();
  });

  it('J4: credits the firearm six rounds per station, scratched and särskjutning included', () => {
    const db = createTestDb();
    const { firearm } = seedFalt(db);
    const json = buildExportJson(db, '1.0.0');

    db.delete(faltStations).run();
    db.delete(sessions).run();
    db.update(firearms).set({ roundCount: 0, roundsSinceMaintenance: 0 }).run();
    const envelope = JSON.parse(json) as { firearms: unknown[] };
    envelope.firearms = [];
    const { groups, records } = dryRunImport(db, JSON.stringify(envelope));
    applyImport(db, groups, records);

    expect(getFirearm(db, firearm.id)?.roundCount).toBe(24);
  });

  it('J5: re-importing onto itself neither duplicates stations nor moves the counter', () => {
    const db = createTestDb();
    const { firearm, session } = seedFalt(db);
    const json = buildExportJson(db, '1.0.0');

    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    expect(stationFields(db, session.id)).toHaveLength(4);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(24);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_DATA_001
 */
it('J3: imports them back into an emptied database field for field', () => {
  const db = createTestDb();
  const { firearm, session } = seedFalt(db);
  const json = buildExportJson(db, '1.0.0');

  wipe(db);
  const { errors, groups, records } = dryRunImport(db, json);
  expect(errors).toEqual([]);
  applyImport(db, groups, records);

  expect(getSession(db, session.id)?.faltResultMode).toBe('poangfalt');
  expect(stationFields(db, session.id)).toEqual(
    EXPECTED_STATIONS.map((s) => ({
      ...s,
      isScratched: s.isScratched ? 1 : 0,
      isShootOff: s.isShootOff ? 1 : 0,
    })),
  );
  // The restored firearm keeps the file's 24, not 24 plus the session again (#511).
  expect(getFirearm(db, firearm.id)?.roundCount).toBe(24);
});
