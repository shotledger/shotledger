// The web builds whole rows the phone has never written itself
// (docs/specs/web-series-entry-spec.md A1–A3). These apply them to the
// phone's real schema, through the phone's real apply path.
import {
  buildSessionEntry,
  newSeriesRow,
  newSessionRow,
  newShotRow,
  sumValueTenths,
  type ChangeRow,
  type ClientChange,
} from '@shotledger/shared';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { series, sessions, shots, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, getFirearm } from './firearms';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import { logMaintenanceEvent } from './maintenance-events';
import { listSeriesForSession } from './series';
import { getSession } from './sessions';
import { listScoredShotsForSession, listShotsForSeries } from './shots';
import { applyChangesSync, readRowSync } from './sync-store';
import { serverRefusals } from '../sync-conformance';

const NOW = '2026-10-07T10:00:00.000Z';

const columnNames = (table: SQLiteTable) =>
  Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();

describe('web-built rows on the phone schema', () => {
  it('A1 column parity: every builder payload has exactly the table columns', () => {
    const sessionRow = newSessionRow('s', NOW, {
      name: 'n',
      type: 'training',
      disciplineId: 'generic-rings',
      programId: null,
      competitionLevel: null,
      isChampionship: false,
      competitionName: null,
      weaponGroup: null,
      shooterClass: null,
      eventId: null,
      firearmId: null,
      ammoLotId: null,
      startedAt: NOW,
      location: null,
      decimalScoring: false,
      seriesLength: null,
    });
    const seriesRow = newSeriesRow('r', NOW, { sessionId: 's', position: 1, isSighter: false });
    const shotRow = newShotRow('h', NOW, {
      seriesId: 'r',
      position: 1,
      valueTenths: 100,
      isInnerTen: false,
    });
    expect(Object.keys(sessionRow).sort()).toEqual(columnNames(sessions));
    expect(Object.keys(seriesRow).sort()).toEqual(columnNames(series));
    expect(Object.keys(shotRow).sort()).toEqual(columnNames(shots));
  });

  describe('a web entry applied with applyChangesSync', () => {
    let db: Database;
    let firearmId: string;
    let changes: ClientChange[];
    let sessionId: string;

    beforeEach(() => {
      db = createTestDb();
      firearmId = createFirearm(db, {
        make: 'Pardini',
        model: 'SP',
        roundCount: 100,
        maintenanceIntervalRounds: 500,
        maintenanceIntervalMonths: 6,
      }).id;
      // Cleaned at 100 rounds, so rounds since maintenance starts at 0.
      logMaintenanceEvent(db, {
        firearmId: firearmId,
        performedAt: '2026-01-01T00:00:00.000Z',
        kind: 'cleaning',
      });
      // What the web pulled: the phone's own payload for the firearm.
      const pulled = readRowSync(db, 'firearms', firearmId)!.payload as Record<string, unknown>;
      db.delete(syncOutbox).run();

      let n = 0;
      const result = buildSessionEntry(
        {
          type: 'training',
          disciplineId: 'spsf-precision',
          programId: null,
          startedAt: '2026-10-06T16:00:00.000Z',
          name: '',
          defaultName: 'Training — 6 Oct 2026',
          location: 'Range',
          competitionLevel: null,
          isChampionship: false,
          competitionName: '',
          weaponGroup: null,
          shooterClass: null,
          eventId: null,
          firearmId,
          ammoLotId: null,
          decimalScoring: false,
          seriesLength: null,
          series: [
            { text: '10 9 X 10 9', isSighter: false },
            { text: '8 7 6 5 4', isSighter: false },
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
      changes = result.changes;
      sessionId = result.sessionId;

      // A phone's firearm payload carries `is_own` as a boolean, which
      // expo-sqlite binds as 1/0 and better-sqlite3 refuses; bind it the
      // device's way. The web's own rows carry no booleans.
      const asBound = (payload: unknown) =>
        Object.fromEntries(
          Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === 'boolean' ? Number(value) : value,
          ]),
        );
      expect(serverRefusals(changes)).toEqual([]);
      const pulledBack: ChangeRow[] = changes.map((change, index) => ({
        tableName: change.tableName,
        rowId: change.rowId,
        seq: index + 1,
        payload: change.tableName === 'firearms' ? asBound(change.payload) : change.payload,
        deletedAt: change.deletedAt,
        updatedAt: change.updatedAt,
      }));
      applyChangesSync(db, pulledBack);
    });

    it('A2 a web-built entry applies on the phone', () => {
      expect(getSession(db, sessionId)).toMatchObject({
        name: 'Training — 6 Oct 2026',
        type: 'training',
        kind: 'series',
        seriesEntryMode: 'ask',
        disciplineId: 'spsf-precision',
        firearmId,
        location: 'Range',
        startedAt: '2026-10-06T16:00:00.000Z',
        deletedAt: null,
      });
      const rows = listSeriesForSession(db, sessionId);
      expect(rows.map((r) => [r.position, r.isSighter])).toEqual([
        [1, 0],
        [2, 0],
      ]);
      expect(
        listShotsForSeries(db, rows[0]!.id).map((s) => [s.position, s.valueTenths, s.isInnerTen]),
      ).toEqual([
        [1, 100, 0],
        [2, 90, 0],
        [3, 100, 1],
        [4, 100, 0],
        [5, 90, 0],
      ]);
      expect(listShotsForSeries(db, rows[1]!.id)).toHaveLength(5);
      // 48 + 30, as typed.
      expect(sumValueTenths(listScoredShotsForSession(db, sessionId))).toBe(780);
      // The web moves the counter on the pulled row and keeps every other
      // column, the intervals included (#800).
      expect(getFirearm(db, firearmId)).toMatchObject({
        roundCount: 110,
        maintenanceIntervalRounds: 500,
        maintenanceIntervalMonths: 6,
      });
      expect(getRoundsSinceMaintenance(db, getFirearm(db, firearmId)!)).toBe(10);
    });

    it('A3 nothing applied is re-queued (the outbox stays empty after apply)', () => {
      expect(db.select().from(syncOutbox).all()).toHaveLength(0);
    });
  });
});
