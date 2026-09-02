import { beforeEach, describe, expect, it } from 'vitest';

import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addSessionTag,
  getOrCreateTag,
  listTags,
  listTagsForSession,
  removeSessionTag,
  softDeleteTag,
} from './tags';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getOrCreateTag', () => {
  it('creates a tag on first use and reuses it after', () => {
    const first = getOrCreateTag(db, 'KM');
    const second = getOrCreateTag(db, 'KM');
    expect(second.id).toBe(first.id);
    expect(listTags(db)).toHaveLength(1);
  });
});

describe('listTags / softDeleteTag', () => {
  it('excludes tombstoned tags', () => {
    const a = getOrCreateTag(db, 'KM');
    getOrCreateTag(db, 'Tävling');
    softDeleteTag(db, a.id);
    expect(listTags(db).map((t) => t.name)).toEqual(['Tävling']);
  });
});

describe('session tags', () => {
  it('links and lists tags for a session', () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const km = getOrCreateTag(db, 'KM');
    const tavling = getOrCreateTag(db, 'Tävling');
    addSessionTag(db, sessionId, km.id);
    addSessionTag(db, sessionId, tavling.id);
    expect(
      listTagsForSession(db, sessionId)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['KM', 'Tävling']);
  });

  it('removeSessionTag unlinks without deleting the tag', () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const km = getOrCreateTag(db, 'KM');
    addSessionTag(db, sessionId, km.id);
    removeSessionTag(db, sessionId, km.id);
    expect(listTagsForSession(db, sessionId)).toHaveLength(0);
    expect(listTags(db)).toHaveLength(1);
  });

  it('a soft-deleted tag disappears from listTagsForSession', () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
    const km = getOrCreateTag(db, 'KM');
    addSessionTag(db, sessionId, km.id);
    softDeleteTag(db, km.id);
    expect(listTagsForSession(db, sessionId)).toHaveLength(0);
  });
});
