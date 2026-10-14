// A web rounds-only session and a web final series, applied to the phone's
// real schema and compared with what the phone itself writes for the same
// act (docs/specs/web-rounds-final-spec.md AP1, AP2).
import {
  buildRoundsEntry,
  buildSessionEntry,
  sessionResults,
  type ChangeRow,
  type ClientChange,
  type EntryResult,
} from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, getFirearm } from './firearms';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import { logMaintenanceEvent } from './maintenance-events';
import { saveSeriesShots, setSessionExtraRounds } from './round-count';
import { addSeries, listSeriesForSession } from './series';
import { createSession, getSession } from './sessions';
import { listShotsForSeries } from './shots';
import { applyChangesSync, readRowSync } from './sync-store';
import { sessionVolumeRounds } from './volume';

const NOW = '2026-10-10T10:00:00.000Z';
const STARTED = '2026-10-09T16:00:00.000Z';

/** The phone's pulled firearm, as the web's context holds it. */
function pulledFirearm(db: Database, id: string) {
  return readRowSync(db, 'firearms', id)!.payload as Record<string, unknown>;
}

function apply(db: Database, result: EntryResult): ClientChange[] {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  // A phone's firearm payload carries `is_own` as a boolean, which
  // expo-sqlite binds as 1/0 and better-sqlite3 refuses (#669 R12).
  const asBound = (payload: unknown) =>
    Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'boolean' ? Number(value) : value,
      ]),
    );
  const rows: ChangeRow[] = result.changes.map((change, index) => ({
    tableName: change.tableName,
    rowId: change.rowId,
    seq: index + 1,
    payload: change.tableName === 'firearms' ? asBound(change.payload) : change.payload,
    deletedAt: change.deletedAt,
    updatedAt: change.updatedAt,
  }));
  applyChangesSync(db, rows);
  return result.changes;
}

const deps = () => {
  let n = 0;
  return {
    newId: uuidv7,
    newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
    now: () => NOW,
  };
};

/** A row's payload without what differs by construction: its id and clock. */
function comparable(payload: Record<string, unknown>) {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = payload;
  return rest;
}

describe('web rounds-only and final rows on the phone schema', () => {
  let web: Database;
  let phone: Database;
  let webFirearm: string;
  let phoneFirearm: string;

  beforeEach(() => {
    web = createTestDb();
    phone = createTestDb();
    webFirearm = createFirearm(web, { make: 'Pardini', model: 'SP', roundCount: 100 }).id;
    phoneFirearm = createFirearm(phone, { make: 'Pardini', model: 'SP', roundCount: 100 }).id;
    // Both cleaned at 100 rounds, so rounds since maintenance starts at 0.
    logMaintenanceEvent(web, {
      firearmId: webFirearm,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'cleaning',
    });
    logMaintenanceEvent(phone, {
      firearmId: phoneFirearm,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'cleaning',
    });
    web.delete(syncOutbox).run();
  });

  it("AP1 a web rounds session is the phone's own: same session row, same counters", () => {
    const changes = apply(
      web,
      buildRoundsEntry(
        {
          type: 'competition',
          disciplineId: 'spsf-falt',
          startedAt: STARTED,
          name: '',
          defaultName: 'Competition — 9 Oct 2026',
          location: 'Range',
          competitionLevel: 'krets',
          isChampionship: false,
          competitionName: 'KM',
          weaponGroup: 'spsf:C',
          shooterClass: '2',
          eventId: null,
          firearmId: webFirearm,
          ammoLotId: null,
          roundsFired: '60',
        },
        {
          firearms: new Map([[webFirearm, pulledFirearm(web, webFirearm)]]),
          firearmGroups: [],
          ammoLots: new Map(),
        },
        deps(),
      ),
    );
    const webSessionId = changes.find((c) => c.tableName === 'sessions')!.rowId;

    // The phone's new-session form for the same entry (new.tsx onCreate).
    const phoneSession = createSession(phone, {
      name: 'Competition — 9 Oct 2026',
      type: 'competition',
      kind: 'rounds',
      disciplineId: 'spsf-falt',
      programId: null,
      competitionLevel: 'krets',
      isChampionship: false,
      competitionName: 'KM',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      eventId: null,
      firearmId: phoneFirearm,
      ammoLotId: null,
      startedAt: STARTED,
      location: 'Range',
      decimalScoring: false,
      faltResultMode: null,
      seriesLength: null,
    });
    setSessionExtraRounds(phone, phoneSession.id, 60);

    const webRow = readRowSync(web, 'sessions', webSessionId)!.payload;
    const phoneRow = readRowSync(phone, 'sessions', phoneSession.id)!.payload;
    expect(comparable(webRow as Record<string, unknown>)).toEqual({
      ...comparable(phoneRow as Record<string, unknown>),
      firearm_id: webFirearm,
    });
    expect(getSession(web, webSessionId)).toMatchObject({ kind: 'rounds', extraRounds: 60 });
    expect(listSeriesForSession(web, webSessionId)).toEqual([]);
    expect(sessionVolumeRounds(web, webSessionId)).toBe(60);

    const counters = (db: Database, id: string) => {
      const firearm = getFirearm(db, id)!;
      return {
        roundCount: firearm.roundCount,
        roundsSinceMaintenance: getRoundsSinceMaintenance(db, firearm),
      };
    };
    expect(counters(web, webFirearm)).toEqual({ roundCount: 160, roundsSinceMaintenance: 60 });
    expect(counters(web, webFirearm)).toEqual(counters(phone, phoneFirearm));
  });

  it('AP2 a web final applies as the phone records one: is_final rows, split results, every shot counted', () => {
    const series = [
      { text: '10 9 8 7 6', isSighter: false },
      { text: '9 9', isSighter: true, isFinal: true },
      { text: '10 10 9 9 X', isSighter: false, isFinal: true },
    ];
    const changes = apply(
      web,
      buildSessionEntry(
        {
          type: 'competition',
          disciplineId: 'spsf-precision',
          programId: 'spsf-precision',
          startedAt: STARTED,
          name: 'KM',
          defaultName: '',
          location: '',
          competitionLevel: 'forening',
          isChampionship: false,
          competitionName: '',
          weaponGroup: null,
          shooterClass: null,
          eventId: null,
          firearmId: webFirearm,
          ammoLotId: null,
          decimalScoring: false,
          seriesLength: null,
          series,
        },
        {
          firearms: new Map([[webFirearm, pulledFirearm(web, webFirearm)]]),
          firearmGroups: [],
          ammoLots: new Map(),
        },
        deps(),
      ),
    );
    const webSessionId = changes.find((c) => c.tableName === 'sessions')!.rowId;

    // The phone: Add Series, then Start Final and two more (session detail).
    const phoneSession = createSession(phone, {
      name: 'KM',
      type: 'competition',
      disciplineId: 'spsf-precision',
      programId: 'spsf-precision',
      competitionLevel: 'forening',
      firearmId: phoneFirearm,
      startedAt: STARTED,
    });
    const shots = (values: [number, boolean][]) =>
      values.map(([valueTenths, isInnerTen]) => ({ valueTenths, isInnerTen }));
    const phoneSeries = [
      {
        isSighter: false,
        isFinal: false,
        shots: shots([
          [100, false],
          [90, false],
          [80, false],
          [70, false],
          [60, false],
        ]),
      },
      {
        isSighter: true,
        isFinal: true,
        shots: shots([
          [90, false],
          [90, false],
        ]),
      },
      {
        isSighter: false,
        isFinal: true,
        shots: shots([
          [100, false],
          [100, false],
          [90, false],
          [90, false],
          [100, true],
        ]),
      },
    ];
    phoneSeries.forEach((s, index) => {
      const row = addSeries(phone, {
        sessionId: phoneSession.id,
        position: index + 1,
        isSighter: s.isSighter,
        isFinal: s.isFinal,
      });
      saveSeriesShots(phone, row.id, s.shots);
    });

    const view = (db: Database, sessionId: string) =>
      listSeriesForSession(db, sessionId).map((row) => ({
        position: row.position,
        isSighter: row.isSighter === 1,
        isFinal: row.isFinal === 1,
        shots: listShotsForSeries(db, row.id).map((shot) => ({
          valueTenths: shot.valueTenths,
          isInnerTen: shot.isInnerTen === 1,
        })),
      }));
    const webView = view(web, webSessionId);
    expect(webView).toEqual(view(phone, phoneSession.id));
    expect(webView.map((s) => [s.position, s.isSighter, s.isFinal])).toEqual([
      [1, false, false],
      [2, true, true],
      [3, false, true],
    ]);
    expect(sessionResults(webView)).toEqual({
      beforeFinalTenths: 400,
      finalTenths: 480,
      totalTenths: 880,
      hasFinal: true,
    });
    expect(sessionVolumeRounds(web, webSessionId)).toBe(12);
    expect(getFirearm(web, webFirearm)!.roundCount).toBe(112);
    expect(getFirearm(web, webFirearm)!.roundCount).toBe(
      getFirearm(phone, phoneFirearm)!.roundCount,
    );
  });
});
