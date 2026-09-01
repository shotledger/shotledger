import { beforeEach, describe, expect, it } from 'vitest';

import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  SighterLimitExceededError,
  addSeries,
  getSeries,
  listSeriesForSession,
  softDeleteSeries,
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
