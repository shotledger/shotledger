// A web session edit or delete must leave the phone exactly where the phone's
// own edit would (docs/specs/web-session-edit-spec.md E1, P1–P7). Two twin
// databases: on one the phone edits through its own functions, on the other
// the web's changes arrive through the phone's real apply path.
import {
  APPLY_ORDER,
  buildSessionDelete,
  buildSessionEdit,
  openedSession,
  type ChangeRow,
  type ClientChange,
  type EditContext,
  type EditResult,
  type SessionEditDraft,
  type StationEditDraft,
} from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { eq } from 'drizzle-orm';

import { series as seriesTable, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addStation,
  faltSessionResult,
  listStationsForSession,
  softDeleteStation,
  updateStation,
  type StationRow,
} from './falt';
import { createFirearm, listFirearms } from './firearms';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import {
  deleteSeriesAndShots,
  deleteSessionAndSeries,
  saveSeriesShots,
  setSessionExtraRounds,
} from './round-count';
import { addSeries, listSeriesForSession, setSeriesSighter } from './series';
import { createSession, getSession, updateSession } from './sessions';
import { listMarksForSeries, saveSeriesMarks } from './shot-marks';
import { listShotsForSeries } from './shots';
import { applyChangesSync, readRowSync, SYNC_TABLES } from './sync-store';
import { serverRefusals } from '../sync-conformance';

type Row = Record<string, unknown>;

/** expo-sqlite binds a boolean as 1/0; better-sqlite3 refuses one. */
const asBound = (payload: unknown): Row =>
  Object.fromEntries(
    Object.entries(payload as Row).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? Number(value) : value,
    ]),
  );

/** Every synced row of `db`, payloads as the phone pushes them. */
function dump(db: Database): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const tableName of APPLY_ORDER) {
    for (const { id } of db.select().from(SYNC_TABLES[tableName]).all() as { id: string }[]) {
      const snapshot = readRowSync(db, tableName, id)!;
      rows.push({
        tableName,
        rowId: id,
        seq: rows.length + 1,
        payload: snapshot.payload,
        deletedAt: null,
        updatedAt: snapshot.updatedAt,
      });
    }
  }
  return rows;
}

const asApplied = (rows: readonly ChangeRow[]): ChangeRow[] =>
  rows.map((row) => ({ ...row, payload: row.payload === null ? null : asBound(row.payload) }));

/** What the web pulls: the phone's rows, soft-deleted ones gone as server tombstones. */
function pulled(db: Database): EditContext {
  const rows = dump(db);
  const table = (name: (typeof APPLY_ORDER)[number]) =>
    new Map(
      rows
        .filter((row) => row.tableName === name && (row.payload as Row).deleted_at === null)
        .map((row) => [row.rowId, row.payload as Row]),
    );
  return {
    sessions: table('sessions'),
    series: table('series'),
    shots: table('shots'),
    faltStations: table('falt_stations'),
    firearms: table('firearms'),
    ammoLots: table('ammo_lots'),
  };
}

let seq = 1000;
function apply(db: Database, changes: readonly ClientChange[]) {
  expect(serverRefusals(changes)).toEqual([]);
  applyChangesSync(
    db,
    asApplied(
      changes.map((change) => ({
        tableName: change.tableName,
        rowId: change.rowId,
        seq: (seq += 1),
        payload: change.payload,
        deletedAt: change.deletedAt,
        updatedAt: change.updatedAt,
      })),
    ),
  );
}

const deps = {
  newId: uuidv7,
  newChangeId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

function changesOf(result: EditResult): ClientChange[] {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.changes;
}

const shots = (values: number[]) => values.map((v) => ({ valueTenths: v * 10 }));

interface Ids {
  sessions: { sC: string; sT: string; sF: string; sR: string };
  series: { c1: string; c2: string; cF: string; t1: string };
  f1: string;
  f2: string;
}

/**
 * sC: a competition on f1, free format: c1 (5 shots), c2 a 3-shot sighter, a
 *     final cF (2 shots), 4 extra rounds. 14 rounds.
 * sT: training on f2, t1 (5 shots).
 * sF: fält on f1, two stations. 12 rounds.
 * sR: rounds only on f2, 20 rounds.
 */
function seed(db: Database): Ids {
  const f1 = createFirearm(db, { make: 'Pardini', model: 'SP', roundCount: 100 }).id;
  const f2 = createFirearm(db, { make: 'Walther', model: 'GSP', roundCount: 10 }).id;
  const make = (fields: Partial<Parameters<typeof createSession>[1]>) =>
    createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-05-01T10:00:00.000Z',
      ...fields,
    }).id;
  const sC = make({
    name: 'Cup',
    type: 'competition',
    firearmId: f1,
    competitionLevel: 'forening',
    competitionName: 'Club Cup',
    location: 'Range A',
  });
  const c1 = addSeries(db, { sessionId: sC, position: 1 }).id;
  saveSeriesShots(db, c1, shots([10, 9, 9, 8, 7]));
  const c2 = addSeries(db, { sessionId: sC, position: 2, isSighter: true }).id;
  saveSeriesShots(db, c2, shots([8, 7, 6]));
  const cF = addSeries(db, { sessionId: sC, position: 3, isFinal: true }).id;
  saveSeriesShots(db, cF, shots([10, 10]));
  setSessionExtraRounds(db, sC, 4);
  const sT = make({ firearmId: f2 });
  const t1 = addSeries(db, { sessionId: sT, position: 1 }).id;
  saveSeriesShots(db, t1, shots([9, 9, 9, 9, 9]));
  const sF = make({ disciplineId: 'spsf-falt', firearmId: f1 });
  addStation(db, { sessionId: sF, position: 1, hits: 5, figuresHit: 3 });
  addStation(db, { sessionId: sF, position: 2, hits: 6, figuresHit: 2 });
  const sR = make({ kind: 'rounds', firearmId: f2 });
  setSessionExtraRounds(db, sR, 20);
  return { sessions: { sC, sT, sF, sR }, series: { c1, c2, cF, t1 }, f1, f2 };
}

/** What a reader of the phone sees, without timestamps and generated ids. */
function snapshot(db: Database, ids: Ids) {
  return {
    sessions: Object.values(ids.sessions).map((id) => {
      const row = getSession(db, id);
      // A deleted session's rows are read too: none of them may stay live.
      const { updatedAt, ...rest } = row ?? { id, deleted: true, updatedAt: null };
      void updatedAt;
      return {
        ...rest,
        series: listSeriesForSession(db, id).map((s) => ({
          position: s.position,
          isSighter: s.isSighter,
          isFinal: s.isFinal,
          photoUri: s.photoUri,
          shots: listShotsForSeries(db, s.id).map((shot) => [
            shot.position,
            shot.valueTenths,
            shot.isInnerTen,
          ]),
        })),
        stations: listStationsForSession(db, id).length,
        // Live shots under any of the session's series, live or not.
        liveShots: db
          .select({ id: seriesTable.id })
          .from(seriesTable)
          .where(eq(seriesTable.sessionId, id))
          .all()
          .reduce((n, s) => n + listShotsForSeries(db, s.id).length, 0),
      };
    }),
    firearms: listFirearms(db).map((f) => [f.id, f.roundCount, getRoundsSinceMaintenance(db, f)]),
  };
}

describe('a web session edit applied on the phone equals the phone editing it', () => {
  let phone: Database;
  let web: Database;
  let ids: Ids;

  beforeEach(() => {
    phone = createTestDb();
    ids = seed(phone);
    web = createTestDb();
    applyChangesSync(web, asApplied(dump(phone)));
    phone.delete(syncOutbox).run();
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  /** The web's changes for `draft`, opened from and applied to the web twin. */
  function webEdit(draft: SessionEditDraft) {
    const context = pulled(web);
    apply(
      web,
      changesOf(buildSessionEdit(draft, openedSession(draft.sessionId, context)!, context, deps)),
    );
  }

  function webDelete(sessionId: string) {
    const context = pulled(web);
    apply(web, changesOf(buildSessionDelete(openedSession(sessionId, context)!, context, deps)));
  }

  const row = (id: string, text: string, isSighter = false, deleted = false) => ({
    id,
    text,
    isSighter,
    deleted,
  });

  it('P1 session fields: the same getSession as updateSession', () => {
    const { sC, sT } = ids.sessions;
    webEdit({
      sessionId: sC,
      fields: {
        name: '  Spring Cup ',
        startedAt: '2026-05-02T07:15:00.000Z',
        location: ' Range B ',
        notes: ' windy ',
        competitionName: ' Spring ',
        competitionLevel: 'krets',
        isChampionship: true,
        weaponGroup: 'spsf:C',
        shooterClass: '2',
        eventId: null,
      },
      series: [],
    });
    updateSession(phone, sC, {
      name: 'Spring Cup',
      startedAt: '2026-05-02T07:15:00.000Z',
      location: 'Range B',
      notes: 'windy',
      competitionName: 'Spring',
      competitionLevel: 'krets',
      isChampionship: true,
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      eventId: null,
    });
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));

    // Blank name keeps the name; blank location and notes clear them.
    webEdit({ sessionId: sT, fields: { name: ' ', location: 'Range T' }, series: [] });
    updateSession(phone, sT, { name: getSession(phone, sT)!.name, location: 'Range T' });
    webEdit({ sessionId: sC, fields: { location: '', notes: '' }, series: [] });
    updateSession(phone, sC, { location: null, notes: null });
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  it('P2 change firearm: the same sessions and firearm counters as updateSession', () => {
    const { sC, sF, sR } = ids.sessions;
    const cases: [string, string | null][] = [
      [sC, ids.f2],
      [sC, null],
      [sC, ids.f1],
      [sF, ids.f2],
      [sR, ids.f1],
    ];
    for (const [sessionId, firearmId] of cases) {
      webEdit({ sessionId, fields: { firearmId }, series: [] });
      updateSession(phone, sessionId, { firearmId });
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
  });

  it('P3 re-enter a series: the same live shots, totals and counters as saveSeriesShots', () => {
    const { sC, sT } = ids.sessions;
    const { c1, t1 } = ids.series;
    webEdit({ sessionId: sC, fields: {}, series: [row(c1, '10 10 X')] });
    saveSeriesShots(phone, c1, [
      { valueTenths: 100 },
      { valueTenths: 100 },
      { valueTenths: 100, isInnerTen: true },
    ]);
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    webEdit({ sessionId: sT, fields: {}, series: [row(t1, '1 2 3 4 5')] });
    saveSeriesShots(phone, t1, shots([1, 2, 3, 4, 5]));
    webEdit({ sessionId: sT, fields: {}, series: [row(t1, '')] });
    saveSeriesShots(phone, t1, []);
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  it('P2+P3 a firearm change and a re-entry in one Save equal the two phone saves', () => {
    const { sC } = ids.sessions;
    const { c1 } = ids.series;
    webEdit({ sessionId: sC, fields: { firearmId: ids.f2 }, series: [row(c1, '9 9')] });
    saveSeriesShots(phone, c1, shots([9, 9]));
    updateSession(phone, sC, { firearmId: ids.f2 });
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  it('P4 add, delete and (un)mark a sighter series: the same as the phone', () => {
    const { sC, sT } = ids.sessions;
    const { c1, c2 } = ids.series;
    // Add: the next position after every live series, the final included.
    webEdit({
      sessionId: sC,
      fields: {},
      series: [{ id: null, text: '7 7', isSighter: false, deleted: false }],
    });
    const added = addSeries(phone, { sessionId: sC, position: 4 }).id;
    saveSeriesShots(phone, added, shots([7, 7]));
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    // Unmark the sighter, then mark another.
    webEdit({ sessionId: sC, fields: {}, series: [row(c2, '8 7 6', false)] });
    setSeriesSighter(phone, c2, false);
    webEdit({ sessionId: sC, fields: {}, series: [row(c1, '10 9 9 8 7', true)] });
    setSeriesSighter(phone, c1, true);
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    // Delete.
    webEdit({ sessionId: sC, fields: {}, series: [row(c2, '8 7 6', false, true)] });
    deleteSeriesAndShots(phone, c2);
    const { t1 } = ids.series;
    webEdit({ sessionId: sT, fields: {}, series: [row(t1, '', false, true)] });
    deleteSeriesAndShots(phone, t1);
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  it('P5 delete: the same live rows and counters as deleteSessionAndSeries, fält and rounds included', () => {
    for (const sessionId of [ids.sessions.sC, ids.sessions.sF, ids.sessions.sR]) {
      webDelete(sessionId);
      deleteSessionAndSeries(phone, sessionId);
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
    // f1: 100 + 14 + 12 − 14 − 12; f2: 10 + 5 + 20 − 20.
    expect(listFirearms(web).map((f) => [f.id, f.roundCount])).toEqual([
      [ids.f1, 100],
      [ids.f2, 15],
    ]);
  });

  it('P6 nothing applied is re-queued (the outbox stays empty after apply)', () => {
    webEdit({
      sessionId: ids.sessions.sC,
      fields: { name: 'X', firearmId: ids.f2 },
      series: [row(ids.series.c1, '9')],
    });
    webDelete(ids.sessions.sT);
    expect(web.select().from(syncOutbox).all()).toHaveLength(0);
  });
});

describe('a photo-scored series re-entered on the web', () => {
  it('P7 keeps its photo_uri; its shot marks no longer list, as after a keypad re-entry', () => {
    const setUp = () => {
      const db = createTestDb();
      const sessionId = createSession(db, {
        name: 'Photo',
        type: 'training',
        disciplineId: 'spsf-precision',
        startedAt: '2026-05-01T10:00:00.000Z',
      }).id;
      const seriesId = addSeries(db, { sessionId, position: 1, photoUri: 'file:///photo.jpg' }).id;
      saveSeriesMarks(
        db,
        seriesId,
        [100, 90].map((valueTenths) => ({
          valueTenths,
          isInnerTen: false,
          xMm: 1,
          yMm: 2,
          caliberMm: 5.6,
        })),
      );
      expect(listMarksForSeries(db, seriesId)).toHaveLength(2);
      return { db, sessionId, seriesId };
    };

    // The phone pulls the web's re-entry.
    const viaWeb = setUp();
    const context = pulled(viaWeb.db);
    apply(
      viaWeb.db,
      changesOf(
        buildSessionEdit(
          {
            sessionId: viaWeb.sessionId,
            fields: {},
            series: [{ id: viaWeb.seriesId, text: '8 8', isSighter: false, deleted: false }],
          },
          openedSession(viaWeb.sessionId, context)!,
          context,
          deps,
        ),
      ),
    );
    // The keypad's re-entry on the phone.
    const viaKeypad = setUp();
    saveSeriesShots(viaKeypad.db, viaKeypad.seriesId, shots([8, 8]));

    for (const { db, seriesId, sessionId } of [viaWeb, viaKeypad]) {
      expect(listMarksForSeries(db, seriesId)).toEqual([]);
      expect(listSeriesForSession(db, sessionId)[0]!.photoUri).toBe('file:///photo.jpg');
      expect(listShotsForSeries(db, seriesId).map((s) => s.valueTenths)).toEqual([80, 80]);
    }
  });
});

describe('a web station or Rounds Fired edit applied on the phone equals the phone editing it', () => {
  let phone: Database;
  let web: Database;
  let ids: Ids;

  beforeEach(() => {
    phone = createTestDb();
    ids = seed(phone);
    web = createTestDb();
    applyChangesSync(web, asApplied(dump(phone)));
    phone.delete(syncOutbox).run();
  });

  /** A station as the phone reads it, without timestamps and its generated id. */
  const stationView = ({ id: _id, createdAt: _c, updatedAt: _u, ...rest }: StationRow) => rest;

  /** Everything a reader of the phone sees, the stations in full. */
  const view = (db: Database) => ({
    ...snapshot(db, ids),
    stations: Object.values(ids.sessions).map((id) =>
      listStationsForSession(db, id).map(stationView),
    ),
  });

  const opened = (db: Database, sessionId: string) =>
    listStationsForSession(db, sessionId).map((row): StationEditDraft => ({
      id: row.id,
      hits: row.hits,
      figuresHit: row.figuresHit,
      figureCount: row.figureCount,
      pointsText: row.points === null ? '' : String(row.points),
      pointsMaxText: row.pointsMax === null ? '' : String(row.pointsMax),
      isScratched: row.isScratched === 1,
      isShootOff: row.isShootOff === 1,
      deleted: false,
    }));

  const added = (fields: Partial<StationEditDraft> = {}): StationEditDraft => ({
    id: null,
    hits: 4,
    figuresHit: 2,
    figureCount: 3,
    pointsText: '',
    pointsMaxText: '',
    isScratched: false,
    isShootOff: false,
    deleted: false,
    ...fields,
  });

  function webEdit(draft: Omit<SessionEditDraft, 'fields' | 'series'> & Partial<SessionEditDraft>) {
    const context = pulled(web);
    const full: SessionEditDraft = { fields: {}, series: [], ...draft };
    apply(
      web,
      changesOf(buildSessionEdit(full, openedSession(full.sessionId, context)!, context, deps)),
    );
  }

  const nextPosition = (db: Database, sessionId: string) =>
    (listStationsForSession(db, sessionId).at(-1)?.position ?? 0) + 1;

  it('P8 add a station, then a shoot-off one: the same live stations and counters as addStation', () => {
    const { sF } = ids.sessions;
    webEdit({
      sessionId: sF,
      stations: [...opened(web, sF), added({ pointsText: '7', pointsMaxText: '10' })],
    });
    addStation(phone, {
      sessionId: sF,
      position: nextPosition(phone, sF),
      hits: 4,
      figuresHit: 2,
      figureCount: 3,
      points: 7,
      pointsMax: 10,
    });
    expect(view(web)).toEqual(view(phone));
    webEdit({ sessionId: sF, stations: [...opened(web, sF), added({ isShootOff: true })] });
    addStation(phone, {
      sessionId: sF,
      position: nextPosition(phone, sF),
      hits: 4,
      figuresHit: 2,
      figureCount: 3,
      isShootOff: true,
    });
    // A plain new station after a shoot-off is one, as nextStationIsShootOff says.
    webEdit({ sessionId: sF, stations: [...opened(web, sF), added()] });
    addStation(phone, {
      sessionId: sF,
      position: nextPosition(phone, sF),
      hits: 4,
      figuresHit: 2,
      figureCount: 3,
      isShootOff: true,
    });
    expect(view(web)).toEqual(view(phone));
  });

  it('P9 change a station (numbers, scratched): the same rows as updateStation; counters unmoved', () => {
    const { sF } = ids.sessions;
    const [first, second] = listStationsForSession(phone, sF);
    const before = listFirearms(web).map((f) => f.roundCount);
    const stations = opened(web, sF);
    stations[0] = { ...stations[0]!, hits: 6, figuresHit: 4, figureCount: 5, pointsText: '3' };
    stations[1] = { ...stations[1]!, isScratched: true };
    webEdit({ sessionId: sF, stations });
    updateStation(phone, first!.id, { hits: 6, figuresHit: 4, figureCount: 5, points: 3 });
    updateStation(phone, second!.id, { isScratched: true });
    expect(view(web)).toEqual(view(phone));
    expect(listFirearms(web).map((f) => f.roundCount)).toEqual(before);
  });

  it('P10 remove a station: the same live stations and counters as softDeleteStation; the gap is kept', () => {
    const { sF } = ids.sessions;
    const [first] = listStationsForSession(phone, sF);
    webEdit({
      sessionId: sF,
      stations: opened(web, sF).map((row, i) => ({ ...row, deleted: i === 0 })),
    });
    softDeleteStation(phone, first!.id);
    expect(view(web)).toEqual(view(phone));
    expect(listStationsForSession(web, sF).map((row) => row.position)).toEqual([2]);
    // A new station goes after the last live one, the gap stays.
    webEdit({ sessionId: sF, stations: [...opened(web, sF), added()] });
    addStation(phone, { sessionId: sF, position: 3, hits: 4, figuresHit: 2, figureCount: 3 });
    expect(view(web)).toEqual(view(phone));
  });

  it('P11 Rounds Fired: the same session row and counters as setSessionExtraRounds, up, down and to blank', () => {
    const { sR } = ids.sessions;
    const cases: [string, number | null][] = [
      ['45', 45],
      ['5', 5],
      ['', null],
      ['0', 0],
    ];
    for (const [typed, rounds] of cases) {
      webEdit({ sessionId: sR, roundsFired: typed });
      setSessionExtraRounds(phone, sR, rounds);
      expect(view(web)).toEqual(view(phone));
    }
  });

  it('P12 one save adding two stations, removing one and changing the firearm equals the phone, one by one', () => {
    const { sF } = ids.sessions;
    const [first] = listStationsForSession(phone, sF);
    webEdit({
      sessionId: sF,
      fields: { firearmId: ids.f2 },
      stations: [
        ...opened(web, sF).map((row, i) => ({ ...row, deleted: i === 0 })),
        added(),
        added({ hits: 0, figuresHit: 0, figureCount: null }),
      ],
    });
    addStation(phone, { sessionId: sF, position: 3, hits: 4, figuresHit: 2, figureCount: 3 });
    addStation(phone, { sessionId: sF, position: 4, hits: 0, figuresHit: 0 });
    softDeleteStation(phone, first!.id);
    updateSession(phone, sF, { firearmId: ids.f2 });
    expect(view(web)).toEqual(view(phone));
  });

  it("P13 the phone reads the web-edited stations: faltSessionResult equals the twin's", () => {
    const { sF } = ids.sessions;
    const stations = opened(web, sF);
    stations[1] = { ...stations[1]!, hits: 2, figuresHit: 1, isScratched: true };
    webEdit({
      sessionId: sF,
      stations: [
        ...stations,
        added({ pointsText: '9', pointsMaxText: '10' }),
        added({ isShootOff: true }),
      ],
    });
    const [, second] = listStationsForSession(phone, sF);
    updateStation(phone, second!.id, { hits: 2, figuresHit: 1, isScratched: true });
    addStation(phone, {
      sessionId: sF,
      position: 3,
      hits: 4,
      figuresHit: 2,
      figureCount: 3,
      points: 9,
      pointsMax: 10,
    });
    addStation(phone, {
      sessionId: sF,
      position: 4,
      hits: 4,
      figuresHit: 2,
      figureCount: 3,
      isShootOff: true,
    });
    expect(faltSessionResult(web, sF)).toEqual(faltSessionResult(phone, sF));
    expect(view(web)).toEqual(view(phone));
    expect(web.select().from(syncOutbox).all()).toHaveLength(0);
  });
});
