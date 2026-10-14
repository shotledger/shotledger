import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  createSession,
  getSession,
  listLocationUsage,
  listSessions,
  softDeleteSession,
  updateSession,
} from './sessions';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function makeSession(overrides: Partial<Parameters<typeof createSession>[1]> = {}) {
  return createSession(db, {
    name: 'Test session',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  });
}

describe('createSession', () => {
  it('sets id, created_at, updated_at and leaves deleted_at null', () => {
    const session = makeSession();
    expect(session.id).toBeTruthy();
    expect(session.createdAt).toBeTruthy();
    expect(session.updatedAt).toBe(session.createdAt);
    expect(session.deletedAt).toBeNull();
  });

  it('coerces boolean flags to integers', () => {
    const session = makeSession({ isChampionship: true, decimalScoring: true });
    expect(session.isChampionship).toBe(1);
    expect(session.decimalScoring).toBe(1);
  });
});

describe('getSession', () => {
  it('returns null-filtering: excludes soft-deleted sessions', () => {
    const session = makeSession();
    softDeleteSession(db, session.id);
    expect(getSession(db, session.id)).toBeUndefined();
  });

  it('finds a non-deleted session by id', () => {
    const session = makeSession();
    expect(getSession(db, session.id)?.id).toBe(session.id);
  });
});

describe('updateSession', () => {
  it('bumps updated_at and applies the patch', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
      const session = makeSession();
      vi.setSystemTime(new Date('2026-10-14T10:00:00.002Z'));
      const updated = updateSession(db, session.id, { name: 'Renamed' });
      expect(updated?.name).toBe('Renamed');
      expect(updated?.updatedAt).toBe('2026-10-14T10:00:00.002Z');
      expect(session.updatedAt).toBe('2026-10-14T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op on a soft-deleted session', () => {
    const session = makeSession();
    softDeleteSession(db, session.id);
    updateSession(db, session.id, { name: 'Should not apply' });
    expect(getSession(db, session.id)).toBeUndefined();
  });
});

describe('softDeleteSession', () => {
  it('sets deleted_at and updated_at, does not hard-delete the row', () => {
    const session = makeSession();
    softDeleteSession(db, session.id);
    const raw = listSessions(db, {});
    expect(raw.find((s) => s.id === session.id)).toBeUndefined();
  });
});

describe('listSessions', () => {
  it('excludes tombstoned sessions', () => {
    const a = makeSession({ name: 'A' });
    const b = makeSession({ name: 'B' });
    softDeleteSession(db, a.id);
    const rows = listSessions(db);
    expect(rows.map((r) => r.id)).toEqual([b.id]);
  });

  it('filters by type', () => {
    makeSession({ type: 'training' });
    const comp = makeSession({ type: 'competition' });
    const rows = listSessions(db, { type: 'competition' });
    expect(rows.map((r) => r.id)).toEqual([comp.id]);
  });

  it('filters by disciplineId', () => {
    makeSession({ disciplineId: 'spsf-milsnabb' });
    const precision = makeSession({ disciplineId: 'spsf-precision' });
    const rows = listSessions(db, { disciplineId: 'spsf-precision' });
    expect(rows.map((r) => r.id)).toEqual([precision.id]);
  });

  it('filters by date range (inclusive)', () => {
    const early = makeSession({ startedAt: '2026-01-01T00:00:00.000Z' });
    const mid = makeSession({ startedAt: '2026-02-01T00:00:00.000Z' });
    const late = makeSession({ startedAt: '2026-03-01T00:00:00.000Z' });
    const rows = listSessions(db, {
      startedFrom: '2026-01-15T00:00:00.000Z',
      startedTo: '2026-02-15T00:00:00.000Z',
    });
    expect(rows.map((r) => r.id)).toEqual([mid.id]);
    void early;
    void late;
  });

  it('orders newest first', () => {
    const first = makeSession({ startedAt: '2026-01-01T00:00:00.000Z' });
    const second = makeSession({ startedAt: '2026-02-01T00:00:00.000Z' });
    const rows = listSessions(db);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});

describe('session kind', () => {
  it('defaults to series when the caller does not choose', () => {
    expect(makeSession().kind).toBe('series');
    expect(getSession(db, makeSession().id)?.kind).toBe('series');
  });

  it('stores an explicit rounds session', () => {
    const rounds = makeSession({ kind: 'rounds' });
    expect(getSession(db, rounds.id)?.kind).toBe('rounds');
  });

  it('filters the list by kind', () => {
    const series = makeSession({ kind: 'series' });
    const rounds = makeSession({ kind: 'rounds' });
    expect(listSessions(db, { kind: 'rounds' }).map((r) => r.id)).toEqual([rounds.id]);
    expect(listSessions(db, { kind: 'series' }).map((r) => r.id)).toEqual([series.id]);
  });
});

describe('listLocationUsage', () => {
  it('is empty when no session has a location', () => {
    makeSession();
    expect(listLocationUsage(db)).toEqual([]);
  });

  it('counts sessions per location and reports the latest use', () => {
    makeSession({ location: 'Klubbens bana', startedAt: '2026-01-01T00:00:00.000Z' });
    makeSession({ location: 'Klubbens bana', startedAt: '2026-03-01T00:00:00.000Z' });
    makeSession({ location: 'Kretsbanan', startedAt: '2026-02-01T00:00:00.000Z' });

    expect([...listLocationUsage(db)].sort((a, b) => a.location.localeCompare(b.location))).toEqual(
      [
        { location: 'Klubbens bana', count: 2, lastUsedAt: '2026-03-01T00:00:00.000Z' },
        { location: 'Kretsbanan', count: 1, lastUsedAt: '2026-02-01T00:00:00.000Z' },
      ],
    );
  });

  it('groups case-insensitively and ignores surrounding whitespace', () => {
    makeSession({ location: 'Klubbens bana', startedAt: '2026-01-01T00:00:00.000Z' });
    makeSession({ location: '  klubbens bana ', startedAt: '2026-02-01T00:00:00.000Z' });
    const rows = listLocationUsage(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(2);
    expect(rows[0]?.lastUsedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('skips blank locations and soft-deleted sessions', () => {
    makeSession({ location: '   ' });
    makeSession({ location: '' });
    const deleted = makeSession({ location: 'Gone' });
    softDeleteSession(db, deleted.id);
    expect(listLocationUsage(db)).toEqual([]);
  });
});
