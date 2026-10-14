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
  replaceSeriesShots,
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

  it('sets is_inner_ten for a centrumtia and leaves it 0 for an ordinary ten', () => {
    const inner = addShot(db, { seriesId, position: 1, valueTenths: 100, isInnerTen: true });
    expect(inner.isInnerTen).toBe(1);

    const ordinaryTen = addShot(db, { seriesId, position: 2, valueTenths: 100 });
    expect(ordinaryTen.isInnerTen).toBe(0);
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

  it('excludes shots from a shoot-off series (#727 PR C, S2)', () => {
    const shootOff = addSeries(db, { sessionId, position: 2, isShootOff: true }).id;
    addShot(db, { seriesId, position: 1, valueTenths: 90 });
    addShot(db, { seriesId: shootOff, position: 1, valueTenths: 100 });
    expect(listScoredShotsForSession(db, sessionId)).toEqual([{ valueTenths: 90 }]);
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

describe('replaceSeriesShots', () => {
  it('writes the entered shots in order', () => {
    const rows = replaceSeriesShots(db, seriesId, [
      { valueTenths: 90 },
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 0 },
    ]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(listShotsForSeries(db, seriesId).map((s) => s.valueTenths)).toEqual([90, 100, 0]);
    expect(listShotsForSeries(db, seriesId)[1]?.isInnerTen).toBe(1);
  });

  it('tombstones the previous shots instead of deleting them', () => {
    const first = replaceSeriesShots(db, seriesId, [{ valueTenths: 90 }, { valueTenths: 80 }]);
    replaceSeriesShots(db, seriesId, [{ valueTenths: 70 }]);
    expect(listShotsForSeries(db, seriesId).map((s) => s.valueTenths)).toEqual([70]);
    expect(getShot(db, first[0]!.id)).toBeUndefined();
  });

  it('clears a series when given no shots', () => {
    replaceSeriesShots(db, seriesId, [{ valueTenths: 90 }]);
    expect(replaceSeriesShots(db, seriesId, [])).toEqual([]);
    expect(listShotsForSeries(db, seriesId)).toEqual([]);
  });
});
