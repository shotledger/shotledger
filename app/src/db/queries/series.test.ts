import { beforeEach, describe, expect, it } from 'vitest';

import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  SighterLimitExceededError,
  addSeries,
  getSeries,
  listSeriesForSession,
  setSeriesSighter,
  softDeleteSeries,
  swapSeriesPositions,
  updateSeries,
} from './series';

let db: Database;
let sessionId: string;

beforeEach(() => {
  db = createTestDb();
  sessionId = createSession(db, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-01-01T00:00:00.000Z',
  }).id;
});

describe('addSeries', () => {
  it('sets id/created_at/updated_at and default flags', () => {
    const s = addSeries(db, { sessionId, position: 1 });
    expect(s.id).toBeTruthy();
    expect(s.isSighter).toBe(0);
    expect(s.isFinal).toBe(0);
  });

  it('allows exactly one main-section sighter', () => {
    addSeries(db, { sessionId, position: 1, isSighter: true });
    expect(() => addSeries(db, { sessionId, position: 2, isSighter: true })).toThrow(
      SighterLimitExceededError,
    );
  });

  it('allows exactly one final-section sighter, independent of the main one', () => {
    addSeries(db, { sessionId, position: 1, isSighter: true });
    // second main sighter still rejected
    expect(() =>
      addSeries(db, { sessionId, position: 2, isSighter: true, isFinal: false }),
    ).toThrow(SighterLimitExceededError);
    // a final sighter is a different section — allowed
    const finalSighter = addSeries(db, {
      sessionId,
      position: 9,
      isSighter: true,
      isFinal: true,
    });
    expect(finalSighter.isSighter).toBe(1);
    expect(finalSighter.isFinal).toBe(1);
    // second final sighter rejected
    expect(() =>
      addSeries(db, { sessionId, position: 10, isSighter: true, isFinal: true }),
    ).toThrow(SighterLimitExceededError);
  });

  it('a soft-deleted sighter no longer counts against the limit', () => {
    const sighter = addSeries(db, { sessionId, position: 1, isSighter: true });
    softDeleteSeries(db, sighter.id);
    expect(() => addSeries(db, { sessionId, position: 2, isSighter: true })).not.toThrow();
  });

  it('does not limit non-sighter series', () => {
    addSeries(db, { sessionId, position: 1 });
    addSeries(db, { sessionId, position: 2 });
    expect(listSeriesForSession(db, sessionId)).toHaveLength(2);
  });
});

describe('listSeriesForSession', () => {
  it('excludes tombstones and orders by position', () => {
    const a = addSeries(db, { sessionId, position: 2 });
    const b = addSeries(db, { sessionId, position: 1 });
    const c = addSeries(db, { sessionId, position: 3 });
    softDeleteSeries(db, c.id);
    expect(listSeriesForSession(db, sessionId).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

describe('getSeries', () => {
  it('returns undefined for a tombstoned series', () => {
    const s = addSeries(db, { sessionId, position: 1 });
    softDeleteSeries(db, s.id);
    expect(getSeries(db, s.id)).toBeUndefined();
  });
});

describe('setSeriesSighter', () => {
  it('sets the sighter flag on a plain series', () => {
    const s = addSeries(db, { sessionId, position: 1 });
    const updated = setSeriesSighter(db, s.id, true);
    expect(updated?.isSighter).toBe(1);
  });

  it('a series that is already the sighter can turn itself off', () => {
    const s = addSeries(db, { sessionId, position: 1, isSighter: true });
    const updated = setSeriesSighter(db, s.id, false);
    expect(updated?.isSighter).toBe(0);
    // and can be turned back on since the section has no sighter now
    expect(setSeriesSighter(db, s.id, true)?.isSighter).toBe(1);
  });

  it('rejects a second sighter in the same section', () => {
    addSeries(db, { sessionId, position: 1, isSighter: true });
    const other = addSeries(db, { sessionId, position: 2 });
    expect(() => setSeriesSighter(db, other.id, true)).toThrow(SighterLimitExceededError);
  });

  it('main and final sections are independent', () => {
    addSeries(db, { sessionId, position: 1, isSighter: true });
    const finalSeries = addSeries(db, { sessionId, position: 2, isFinal: true });
    expect(setSeriesSighter(db, finalSeries.id, true)?.isSighter).toBe(1);
  });

  it('rejects sighter on an override series', () => {
    const override = addSeries(db, {
      sessionId,
      position: 1,
      isTotalOverride: true,
      totalOverrideTenths: 470,
      totalOverrideShotCount: 5,
    });
    expect(() => setSeriesSighter(db, override.id, true)).toThrow(RangeError);
  });

  it('returns undefined for a tombstoned series', () => {
    const s = addSeries(db, { sessionId, position: 1 });
    softDeleteSeries(db, s.id);
    expect(setSeriesSighter(db, s.id, true)).toBeUndefined();
  });
});

describe('swapSeriesPositions', () => {
  it('exchanges two series positions and leaves the rest alone', () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const a = addSeries(db, { sessionId, position: 1 });
    const b = addSeries(db, { sessionId, position: 2 });
    const c = addSeries(db, { sessionId, position: 3 });

    swapSeriesPositions(db, b.id, c.id);

    const byId = new Map(listSeriesForSession(db, sessionId).map((row) => [row.id, row.position]));
    expect(byId.get(a.id)).toBe(1);
    expect(byId.get(b.id)).toBe(3);
    expect(byId.get(c.id)).toBe(2);
  });

  it('never leaves two series sharing a position', () => {
    // The swap parks one row outside the range first; a half-applied swap
    // would collide, and every read path orders by position.
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const a = addSeries(db, { sessionId, position: 1 });
    const b = addSeries(db, { sessionId, position: 2 });

    swapSeriesPositions(db, a.id, b.id);

    const positions = listSeriesForSession(db, sessionId).map((row) => row.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.some((p) => p < 1)).toBe(false);
  });

  it('does nothing when either series is gone', () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const a = addSeries(db, { sessionId, position: 1 });

    expect(() => swapSeriesPositions(db, a.id, 'missing')).not.toThrow();
    expect(listSeriesForSession(db, sessionId)[0]!.position).toBe(1);
  });
});

describe('updateSeries', () => {
  it('stores the photo geometry as the JSON string it was given, and clears it', () => {
    const s = addSeries(db, { sessionId, position: 1 });
    expect(getSeries(db, s.id)?.photoGeometry).toBeNull();
    const json =
      '{"imageWidth":2048,"imageHeight":1536,"source":"auto","mmToImage":[4,0,1024,0,4,768,0,0,1]}';
    expect(updateSeries(db, s.id, { photoGeometry: json })?.photoGeometry).toBe(json);
    expect(updateSeries(db, s.id, { photoGeometry: null })?.photoGeometry).toBeNull();
  });
});
