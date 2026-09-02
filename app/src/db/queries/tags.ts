import { and, eq, isNull } from 'drizzle-orm';

import { sessionTags, tags } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export function createTag(db: Database, name: string) {
  const now = nowIso();
  const row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, name };
  db.insert(tags).values(row).run();
  return row;
}

export function listTags(db: Database) {
  return db.select().from(tags).where(isNull(tags.deletedAt)).orderBy(tags.name).all();
}

export function getTagByName(db: Database, name: string) {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.name, name), isNull(tags.deletedAt)))
    .get();
}

/** Returns the existing non-deleted tag with this name, creating it if absent. */
export function getOrCreateTag(db: Database, name: string) {
  return getTagByName(db, name) ?? createTag(db, name);
}

export function softDeleteTag(db: Database, id: string) {
  const now = nowIso();
  db.update(tags).set({ deletedAt: now, updatedAt: now }).where(eq(tags.id, id)).run();
}

export function addSessionTag(db: Database, sessionId: string, tagId: string) {
  db.insert(sessionTags).values({ sessionId, tagId }).onConflictDoNothing().run();
}

export function removeSessionTag(db: Database, sessionId: string, tagId: string) {
  db.delete(sessionTags)
    .where(and(eq(sessionTags.sessionId, sessionId), eq(sessionTags.tagId, tagId)))
    .run();
}

export function listTagsForSession(db: Database, sessionId: string) {
  return db
    .select({ id: tags.id, name: tags.name, createdAt: tags.createdAt, updatedAt: tags.updatedAt })
    .from(sessionTags)
    .innerJoin(tags, eq(sessionTags.tagId, tags.id))
    .where(and(eq(sessionTags.sessionId, sessionId), isNull(tags.deletedAt)))
    .all();
}
