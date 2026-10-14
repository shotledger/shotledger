import { isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { addSeries } from './series';
import { createSession } from './sessions';
import { createAmmoLot } from './ammo-lots';
import {
  listGroupSamplesByAmmoLot,
  listMarksForSeries,
  listMarksForSession,
  saveSeriesMarks,
  sessionHasMarks,
} from './shot-marks';
import { listShotsForSeries } from './shots';
import { shotMarks } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';

let db: Database;
let sessionId: string;
let seriesId: string;

const mark = (xMm: number, yMm: number, valueTenths: number, isInnerTen = false) => ({
  xMm,
  yMm,
  caliberMm: 5.6,
  valueTenths,
  isInnerTen,
});

beforeEach(() => {
  db = createTestDb();
  sessionId = createSession(db, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-01-01T00:00:00.000Z',
  }).id;
  seriesId = addSeries(db, { sessionId, position: 1 }).id;
});

describe('saveSeriesMarks', () => {
  it('writes shots through the entry model and a mark beside each', () => {
    saveSeriesMarks(db, seriesId, [mark(0, 0, 100, true), mark(10, -20, 90)]);

    const shots = listShotsForSeries(db, seriesId);
    expect(shots.map((s) => [s.position, s.valueTenths, s.isInnerTen])).toEqual([
      [1, 100, 1],
      [2, 90, 0],
    ]);

    const marks = listMarksForSeries(db, seriesId);
    expect(marks.map((m) => [m.position, m.xMm, m.yMm, m.caliberMm])).toEqual([
      [1, 0, 0, 5.6],
      [2, 10, -20, 5.6],
    ]);
  });

  it('keeps marks in lock-step with shot positions', () => {
    saveSeriesMarks(db, seriesId, [mark(1, 1, 100), mark(2, 2, 90), mark(3, 3, 80)]);
    const marks = listMarksForSeries(db, seriesId);
    expect(marks.map((m) => m.xMm)).toEqual([1, 2, 3]);
    expect(marks.map((m) => m.valueTenths)).toEqual([100, 90, 80]);
  });

  it('replaces a previous marking rather than accumulating', () => {
    saveSeriesMarks(db, seriesId, [mark(1, 1, 100), mark(2, 2, 90)]);
    saveSeriesMarks(db, seriesId, [mark(5, 5, 70)]);

    expect(listMarksForSeries(db, seriesId)).toHaveLength(1);
    expect(listMarksForSeries(db, seriesId)[0]?.xMm).toBe(5);
    expect(listShotsForSeries(db, seriesId)).toHaveLength(1);
  });

  it('tombstones the replaced marks instead of orphaning them', () => {
    // The reads join through `shots`, so an orphaned mark is invisible to
    // them either way — but it would still be a live row pointing at a
    // soft-deleted shot, which is exactly what the sync foundation must
    // never see. Assert on the raw table.
    saveSeriesMarks(db, seriesId, [mark(1, 1, 100), mark(2, 2, 90)]);
    saveSeriesMarks(db, seriesId, [mark(5, 5, 70)]);

    const live = db.select().from(shotMarks).where(isNull(shotMarks.deletedAt)).all();
    expect(live).toHaveLength(1);
    expect(live[0]?.xMm).toBe(5);
  });

  it('records the caliber used, so editing the firearm later cannot re-score it', () => {
    saveSeriesMarks(db, seriesId, [{ ...mark(0, 0, 100), caliberMm: 9 }]);
    expect(listMarksForSeries(db, seriesId)[0]?.caliberMm).toBe(9);
  });

  it('carries the user X call through to the shot row', () => {
    saveSeriesMarks(db, seriesId, [mark(0, 0, 100, true), mark(0, 1, 100, false)]);
    expect(listMarksForSeries(db, seriesId).map((m) => m.isInnerTen)).toEqual([true, false]);
  });

  it('accepts an empty marking (the user cleared every mark)', () => {
    saveSeriesMarks(db, seriesId, [mark(1, 1, 100)]);
    saveSeriesMarks(db, seriesId, []);
    expect(listMarksForSeries(db, seriesId)).toEqual([]);
    expect(listShotsForSeries(db, seriesId)).toEqual([]);
  });

  it('rejects a non-finite coordinate before writing anything', () => {
    expect(() => saveSeriesMarks(db, seriesId, [mark(Number.NaN, 0, 100)])).toThrow(RangeError);
    expect(listShotsForSeries(db, seriesId)).toEqual([]);
  });

  it('rejects a non-positive caliber before writing anything', () => {
    expect(() => saveSeriesMarks(db, seriesId, [{ ...mark(0, 0, 100), caliberMm: 0 }])).toThrow(
      RangeError,
    );
    expect(listShotsForSeries(db, seriesId)).toEqual([]);
  });
});

describe('listMarksForSession', () => {
  it('spans every scored series, ordered by series then shot position', () => {
    const second = addSeries(db, { sessionId, position: 2 }).id;
    saveSeriesMarks(db, seriesId, [mark(1, 0, 100), mark(2, 0, 90)]);
    saveSeriesMarks(db, second, [mark(3, 0, 80)]);

    expect(listMarksForSession(db, sessionId).map((m) => m.xMm)).toEqual([1, 2, 3]);
  });

  it('excludes sighter series, which are volume and never score', () => {
    const sighter = addSeries(db, { sessionId, position: 2, isSighter: true }).id;
    saveSeriesMarks(db, seriesId, [mark(1, 0, 100)]);
    saveSeriesMarks(db, sighter, [mark(99, 0, 50)]);

    expect(listMarksForSession(db, sessionId).map((m) => m.xMm)).toEqual([1]);
  });

  it('does not leak marks from another session', () => {
    const other = createSession(db, {
      name: 'Other',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-02T00:00:00.000Z',
    }).id;
    const otherSeries = addSeries(db, { sessionId: other, position: 1 }).id;
    saveSeriesMarks(db, seriesId, [mark(1, 0, 100)]);
    saveSeriesMarks(db, otherSeries, [mark(2, 0, 100)]);

    expect(listMarksForSession(db, sessionId).map((m) => m.xMm)).toEqual([1]);
    expect(listMarksForSession(db, other).map((m) => m.xMm)).toEqual([2]);
  });
});

describe('sessionHasMarks', () => {
  it('is false for a session that predates photo scoring', () => {
    expect(sessionHasMarks(db, sessionId)).toBe(false);
  });

  it('is true once any series is marked', () => {
    saveSeriesMarks(db, seriesId, [mark(0, 0, 100)]);
    expect(sessionHasMarks(db, sessionId)).toBe(true);
  });

  it('is false again after the marks are cleared', () => {
    saveSeriesMarks(db, seriesId, [mark(0, 0, 100)]);
    saveSeriesMarks(db, seriesId, []);
    expect(sessionHasMarks(db, sessionId)).toBe(false);
  });
});

describe('listGroupSamplesByAmmoLot', () => {
  function markedSession(ammoLotId: string | null, isSighter = false) {
    const id = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      ammoLotId,
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    return addSeries(db, { sessionId: id, position: 1, isSighter }).id;
  }

  it('groups marks per series and tags them with the session lot', () => {
    const lot = createAmmoLot(db, { label: 'Lot' });
    const a = markedSession(lot.id);
    const b = markedSession(lot.id);
    saveSeriesMarks(db, a, [mark(0, 0, 100), mark(3, 4, 90)]);
    saveSeriesMarks(db, b, [mark(1, 1, 100)]);

    const samples = listGroupSamplesByAmmoLot(db);
    expect(samples).toHaveLength(2);
    expect(samples.every((sample) => sample.ammoLotId === lot.id)).toBe(true);
    expect(samples.find((sample) => sample.seriesId === a)?.points).toEqual([
      { xMm: 0, yMm: 0 },
      { xMm: 3, yMm: 4 },
    ]);
  });

  it('drops sighters and sessions with no ammo lot', () => {
    const lot = createAmmoLot(db, { label: 'Lot' });
    saveSeriesMarks(db, markedSession(lot.id, true), [mark(0, 0, 100)]);
    saveSeriesMarks(db, markedSession(null), [mark(0, 0, 100)]);

    expect(listGroupSamplesByAmmoLot(db)).toEqual([]);
  });
});
