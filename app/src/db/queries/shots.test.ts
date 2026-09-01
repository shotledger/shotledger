import { beforeEach, describe, expect, it } from 'vitest';

import { addSeries } from './series';
import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addShot,
  countAllShots,
  getShot,
  listScoredShotsForSession,
  listShotsForSeries,
  softDeleteShot,
  updateShot,
} from './shots';

let db: Database;
let seriesId: string;
let sessionId: string;

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

describe('addShot', () => {
  it('stores value_tenths as given (integer mode: value * 10)', () => {
    const shot = addShot(db, { seriesId, position: 1, valueTenths: 90 });
    expect(shot.valueTenths).toBe(90);
    expect(shot.isInnerTen).toBe(0);
  });

  it('accepts the full 0-109 range', () => {
    expect(addShot(db, { seriesId, position: 1, valueTenths: 0 }).valueTenths).toBe(0);
    expect(addShot(db, { seriesId, position: 2, valueTenths: 109 }).valueTenths).toBe(109);
  });

  it('rejects out-of-range values', () => {
    expect(() => addShot(db, { seriesId, position: 1, valueTenths: -1 })).toThrow(RangeError);
    expect(() => addShot(db, { seriesId, position: 1, valueTenths: 110 })).toThrow(RangeError);
  });

  it('sets is_inner_ten and is_inner_ten_decimal flags', () => {
    const shot = addShot(db, {
      seriesId,
      position: 1,
      valueTenths: 100,
      isInnerTen: true,
      isInnerTenDecimal: true,
    });
    expect(shot.isInnerTen).toBe(1);
    expect(shot.isInnerTenDecimal).toBe(1);
  });
});

describe('updateShot', () => {
  it('bumps updated_at and applies only given fields', () => {
    const shot = addShot(db, { seriesId, position: 1, valueTenths: 80 });
    const updated = updateShot(db, shot.id, { valueTenths: 100, isInnerTen: true });
    expect(updated?.valueTenths).toBe(100);
    expect(updated?.isInnerTen).toBe(1);
    expect(updated?.updatedAt).toBeTruthy();
  });

  it('ignores updates on a soft-deleted shot', () => {
    const shot = addShot(db, { seriesId, position: 1, valueTenths: 80 });
    softDeleteShot(db, shot.id);
    updateShot(db, shot.id, { valueTenths: 100 });
    expect(getShot(db, shot.id)).toBeUndefined();
  });
});

describe('listShotsForSeries', () => {
  it('excludes tombstones and orders by position', () => {
    const a = addShot(db, { seriesId, position: 2, valueTenths: 70 });
    const b = addShot(db, { seriesId, position: 1, valueTenths: 80 });
    const c = addShot(db, { seriesId, position: 3, valueTenths: 90 });
    softDeleteShot(db, c.id);
    expect(listShotsForSeries(db, seriesId).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

describe('listScoredShotsForSession', () => {
  it('excludes shots from sighter series', () => {
    const sighterSeriesId = addSeries(db, { sessionId, position: 2, isSighter: true }).id;
    addShot(db, { seriesId, position: 1, valueTenths: 90 });
    addShot(db, { seriesId, position: 2, valueTenths: 80 });
    addShot(db, { seriesId: sighterSeriesId, position: 1, valueTenths: 100 });
    expect(listScoredShotsForSession(db, sessionId)).toEqual([
      { valueTenths: 90 },
      { valueTenths: 80 },
    ]);
  });

  it('excludes soft-deleted shots and series', () => {
    const a = addShot(db, { seriesId, position: 1, valueTenths: 90 });
    addShot(db, { seriesId, position: 2, valueTenths: 80 });
    softDeleteShot(db, a.id);
    expect(listScoredShotsForSession(db, sessionId)).toEqual([{ valueTenths: 80 }]);
  });
});

describe('countAllShots', () => {
  it('counts shots across sessions, excluding tombstones', () => {
    const a = addShot(db, { seriesId, position: 1, valueTenths: 90 });
    addShot(db, { seriesId, position: 2, valueTenths: 80 });
    softDeleteShot(db, a.id);
    expect(countAllShots(db)).toBe(1);
  });
});
