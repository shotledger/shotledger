// The web builds fält rows the phone has never written itself
// (docs/specs/web-falt-entry-spec.md AF1–AF3). These apply them to the
// phone's real schema, through the phone's real apply path.
import { buildFaltEntry, newStationRow, type ChangeRow } from '@shotledger/shared';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { faltStations, sessions, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { faltSessionResult, listStationsForSession } from './falt';
import { createFirearm, getFirearm } from './firearms';
import { getSession } from './sessions';
import { applyChangesSync, readRowSync } from './sync-store';
import { serverRefusals } from '../sync-conformance';
import { sessionVolumeRounds } from './volume';

const NOW = '2026-10-07T10:00:00.000Z';

const columnNames = (table: SQLiteTable) =>
  Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();

// Nothing entered: Hits not chosen (web-falt-entry-spec R8).
const station = (patch: Record<string, unknown> = {}) => ({
  hits: null,
  figuresHit: 0,
  figureCount: null,
  pointsText: '',
  pointsMaxText: '',
  isScratched: false,
  isShootOff: false,
  ...patch,
});

/** A phone payload's booleans bound as expo-sqlite binds them; better-sqlite3 refuses booleans. */
const asBound = (payload: unknown) =>
  Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? Number(value) : value,
    ]),
  );

describe('web-built fält rows on the phone schema', () => {
  let db: Database;
  let firearmId: string;
  let sessionId: string;

  beforeEach(() => {
    db = createTestDb();
    firearmId = createFirearm(db, { make: 'Glock', model: '17', roundCount: 100 }).id;
    const pulled = readRowSync(db, 'firearms', firearmId)!.payload as Record<string, unknown>;
    db.delete(syncOutbox).run();

    let n = 0;
    const result = buildFaltEntry(
      {
        type: 'competition',
        disciplineId: 'spsf-falt',
        startedAt: '2026-10-06T08:00:00.000Z',
        name: 'Fältskjutning',
        defaultName: 'Competition — 6 Oct 2026',
        location: 'Range',
        competitionLevel: 'krets',
        isChampionship: false,
        competitionName: '',
        weaponGroup: 'spsf:C',
        shooterClass: '2',
        eventId: null,
        firearmId,
        ammoLotId: null,
        faltResultMode: 'poangfalt',
        stations: [
          station({ hits: 6, figuresHit: 3, figureCount: 3 }),
          station({ hits: 4, figuresHit: 2, pointsText: '8', pointsMaxText: '10' }),
          station({ hits: 6, figuresHit: 6, isScratched: true }),
          // Every shot missed, no figure count: a result the phone's own screen cannot make (R8).
          station({ hits: 0 }),
          station({ hits: 5, figuresHit: 2, isShootOff: true }),
          station(),
        ],
      },
      { firearms: new Map([[firearmId, pulled]]), firearmGroups: [], ammoLots: new Map() },
      {
        newId: uuidv7,
        newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
        now: () => NOW,
      },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    sessionId = result.sessionId;

    expect(serverRefusals(result.changes)).toEqual([]);
    const pulledBack: ChangeRow[] = result.changes.map((change, index) => ({
      tableName: change.tableName,
      rowId: change.rowId,
      seq: index + 1,
      payload: change.tableName === 'firearms' ? asBound(change.payload) : change.payload,
      deletedAt: change.deletedAt,
      updatedAt: change.updatedAt,
    }));
    applyChangesSync(db, pulledBack);
  });

  it('AF1 column parity: the station and session payloads have exactly the table columns', () => {
    const stationRow = newStationRow('st', NOW, {
      sessionId: 's',
      position: 1,
      hits: 0,
      figuresHit: 0,
      figureCount: null,
      points: null,
      pointsMax: null,
      isScratched: false,
      isShootOff: false,
    });
    expect(Object.keys(stationRow).sort()).toEqual(columnNames(faltStations));
    const sessionRow = readRowSync(db, 'sessions', sessionId)!.payload as Record<string, unknown>;
    expect(Object.keys(sessionRow).sort()).toEqual(columnNames(sessions));
  });

  it('AF2 a web-built fält entry applies on the phone', () => {
    expect(getSession(db, sessionId)).toMatchObject({
      name: 'Fältskjutning',
      type: 'competition',
      kind: 'series',
      disciplineId: 'spsf-falt',
      programId: null,
      faltResultMode: 'poangfalt',
      competitionLevel: 'krets',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      firearmId,
      deletedAt: null,
    });
    expect(
      listStationsForSession(db, sessionId).map((s) => [
        s.position,
        s.hits,
        s.figuresHit,
        s.figureCount,
        s.points,
        s.pointsMax,
        s.isScratched,
        s.isShootOff,
      ]),
    ).toEqual([
      [1, 6, 3, 3, null, null, 0, 0],
      [2, 4, 2, null, 8, 10, 0, 0],
      [3, 6, 6, null, null, null, 1, 0],
      [4, 0, 0, null, null, null, 0, 0],
      [5, 5, 2, null, null, null, 0, 1],
    ]);
    // The scratched and the shoot-off stations stay out of the result; the all-miss one counts.
    expect(faltSessionResult(db, sessionId)).toMatchObject({
      stationCount: 3,
      hits: 10,
      figuresHit: 5,
      poangfaltPoints: 15,
      ringedFigurePoints: 8,
      pointsMax: 10,
      figureCount: null,
      hitsPossible: 18,
    });
    // Five stations fired, six rounds each, as the phone's own volume counts them.
    expect(sessionVolumeRounds(db, sessionId)).toBe(30);
    expect(getFirearm(db, firearmId)).toMatchObject({
      roundCount: 130,
      roundsSinceMaintenance: 30,
    });
  });

  it('AF3 nothing applied is re-queued (the outbox stays empty after apply)', () => {
    expect(db.select().from(syncOutbox).all()).toHaveLength(0);
  });
});
