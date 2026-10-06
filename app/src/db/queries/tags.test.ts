import { beforeEach, describe, expect, it } from 'vitest';

import { sessionTags, syncOutbox, tags } from '../schema';
import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addSessionTag,
  createTag,
  getOrCreateTag,
  listTags,
  listTagsBySession,
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

describe('listTagsBySession', () => {
  function session(name: string) {
    return createSession(db, {
      name,
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
  }

  it('groups names by session, sorted, and omits untagged sessions', () => {
    const a = session('A');
    const b = session('B');
    session('C');
    const km = getOrCreateTag(db, 'KM');
    const tavling = getOrCreateTag(db, 'Tävling');
    addSessionTag(db, a, tavling.id);
    addSessionTag(db, a, km.id);
    addSessionTag(db, b, km.id);

    const bySession = listTagsBySession(db);
    expect(bySession.get(a)).toEqual(['KM', 'Tävling']);
    expect(bySession.get(b)).toEqual(['KM']);
    expect(bySession.has('missing')).toBe(false);
    expect(bySession.size).toBe(2);
  });

  it('excludes a soft-deleted tag', () => {
    const a = session('A');
    const km = getOrCreateTag(db, 'KM');
    addSessionTag(db, a, km.id);
    softDeleteTag(db, km.id);
    expect(listTagsBySession(db).size).toBe(0);
  });
});

// docs/specs/sync-tags-settings-spec.md §2.2, §2.5, §2.8.
describe('synced tag links and duplicate tag names', () => {
  const NOW = '2026-10-06T00:00:00.000Z';

  function session(name = 'S') {
    return createSession(db, {
      name,
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    }).id;
  }
  const links = () => db.select().from(sessionTags).orderBy(sessionTags.id).all();
  const outboxFor = (table: string) =>
    db
      .select()
      .from(syncOutbox)
      .all()
      .filter((row) => row.tableName === table);
  /** A second live tag with the same name, as a pull from another device leaves it. */
  function copyOf(name: string, id: string) {
    db.insert(tags).values({ id, name, createdAt: NOW, updatedAt: NOW, deletedAt: null }).run();
    return id;
  }
  function linkRow(sessionId: string, tagId: string, id: string, deletedAt: string | null = null) {
    db.insert(sessionTags)
      .values({ id, sessionId, tagId, createdAt: NOW, updatedAt: NOW, deletedAt })
      .run();
  }

  it('T1 tagging is idempotent on the live pair', () => {
    const s = session();
    const km = getOrCreateTag(db, 'KM');
    db.delete(syncOutbox).run();
    addSessionTag(db, s, km.id);
    addSessionTag(db, s, km.id);
    expect(links().filter((l) => l.deletedAt === null)).toHaveLength(1);
    expect(outboxFor('session_tags')).toHaveLength(1);
  });

  it('T2 untagging tombstones the link, never deletes it, and queues it', () => {
    const s = session();
    const km = getOrCreateTag(db, 'KM');
    addSessionTag(db, s, km.id);
    db.delete(syncOutbox).run();
    removeSessionTag(db, s, km.id);
    const [row] = links();
    expect(links()).toHaveLength(1);
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.updatedAt).toBe(row!.deletedAt);
    expect(outboxFor('session_tags').map((e) => e.rowId)).toEqual([row!.id]);
  });

  it('T3 untag then retag writes a new link id', () => {
    const s = session();
    const km = getOrCreateTag(db, 'KM');
    addSessionTag(db, s, km.id);
    removeSessionTag(db, s, km.id);
    addSessionTag(db, s, km.id);
    const rows = links();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
    expect(rows.filter((l) => l.deletedAt === null)).toHaveLength(1);
    expect(listTagsForSession(db, s).map((t) => t.name)).toEqual(['KM']);
  });

  it('T4 readers dedupe duplicate links and skip tombstoned ones', () => {
    const s = session();
    const km = getOrCreateTag(db, 'KM');
    const cup = getOrCreateTag(db, 'Cup');
    linkRow(s, km.id, 'l1');
    linkRow(s, km.id, 'l2');
    linkRow(s, cup.id, 'l3', NOW);
    expect(listTagsForSession(db, s)).toEqual([expect.objectContaining({ id: km.id, name: 'KM' })]);
    expect(listTagsBySession(db).get(s)).toEqual(['KM']);
  });

  it('T5 untag removes every live duplicate of the pair', () => {
    const s = session();
    const km = getOrCreateTag(db, 'KM');
    linkRow(s, km.id, 'l1');
    linkRow(s, km.id, 'l2');
    removeSessionTag(db, s, km.id);
    expect(links().filter((l) => l.deletedAt === null)).toEqual([]);
  });

  it('N5 re-creating a deleted tag succeeds with a new id', () => {
    const first = createTag(db, 'KM');
    softDeleteTag(db, first.id);
    const again = getOrCreateTag(db, 'KM');
    expect(again.id).not.toBe(first.id);
    expect(listTags(db)).toEqual([expect.objectContaining({ id: again.id, name: 'KM' })]);
  });

  it('two live copies of a name list as one tag, on the earliest id', () => {
    const km = getOrCreateTag(db, 'KM');
    const later = copyOf('KM', 'ffffffff-ffff-7fff-bfff-ffffffffffff');
    const earlier = copyOf('KM', '00000000-0000-7000-8000-000000000000');
    expect(listTags(db).map((t) => [t.id, t.name])).toEqual([[earlier, 'KM']]);
    expect(getOrCreateTag(db, 'KM').id).toBe(earlier);
    expect([km.id, later]).not.toContain(earlier);
  });

  it('N6 tagging a session through either copy is one tag', () => {
    const s = session();
    const a = getOrCreateTag(db, 'KM').id;
    const b = copyOf('KM', 'ffffffff-ffff-7fff-bfff-ffffffffffff');
    addSessionTag(db, s, a);
    addSessionTag(db, s, b);
    expect(links()).toHaveLength(1);
  });

  it('N7 untagging through either copy removes the links to both', () => {
    const s = session();
    const a = getOrCreateTag(db, 'KM').id;
    const b = copyOf('KM', 'ffffffff-ffff-7fff-bfff-ffffffffffff');
    linkRow(s, a, 'l1');
    linkRow(s, b, 'l2');
    removeSessionTag(db, s, a);
    expect(links().filter((l) => l.deletedAt === null)).toEqual([]);
    expect(listTagsForSession(db, s)).toEqual([]);
  });

  it('untagging leaves the same tag on another session alone', () => {
    const s1 = session('1');
    const s2 = session('2');
    const km = getOrCreateTag(db, 'KM').id;
    addSessionTag(db, s1, km);
    addSessionTag(db, s2, km);
    removeSessionTag(db, s1, km);
    expect(listTagsBySession(db)).toEqual(new Map([[s2, ['KM']]]));
  });

  it('softDeleteTag deletes every live copy of the name', () => {
    const a = getOrCreateTag(db, 'KM').id;
    copyOf('KM', 'ffffffff-ffff-7fff-bfff-ffffffffffff');
    getOrCreateTag(db, 'Cup');
    softDeleteTag(db, a);
    expect(listTags(db).map((t) => t.name)).toEqual(['Cup']);
  });
});
