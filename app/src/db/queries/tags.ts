// Tag names and tag links are not unique on disk (ADR 0019): names resolve
// through shared/src/tags/canonical.ts, and a link is live while its
// deleted_at is null.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { canonicalTags, liveSessionTags, tagNamesBySession } from '@shotledger/shared';

import { sessionTags, tags } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export function createTag(db: Database, name: string) {
  const now = nowIso();
  const row = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, name };
  db.insert(tags).values(row).run();
  return row;
}

const allTags = (db: Database) => db.select().from(tags).all();
const allLinks = (db: Database) => db.select().from(sessionTags).all();

/** Live tags, one per name (the canonical copy), sorted by name. */
export function listTags(db: Database) {
  const byId = new Map(allTags(db).map((tag) => [tag.id, tag]));
  return canonicalTags([...byId.values()]).map((tag) => byId.get(tag.id)!);
}

export function getTagByName(db: Database, name: string) {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.name, name), isNull(tags.deletedAt)))
    .orderBy(tags.id)
    .get();
}

/** Returns the canonical live tag with this name, creating it if absent. */
export function getOrCreateTag(db: Database, name: string) {
  return getTagByName(db, name) ?? createTag(db, name);
}

/** Ids of every tag, live or not, sharing this tag's name. */
function sameNameIds(db: Database, tagId: string): string[] {
  const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!tag) return [tagId];
  return db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, tag.name))
    .all()
    .map((row) => row.id);
}

/** Deletes the name: every live copy of it is tombstoned. */
export function softDeleteTag(db: Database, id: string) {
  const now = nowIso();
  db.update(tags)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(inArray(tags.id, sameNameIds(db, id)), isNull(tags.deletedAt)))
    .run();
}

function liveLinks(db: Database, sessionId: string, tagId: string) {
  return and(
    eq(sessionTags.sessionId, sessionId),
    inArray(sessionTags.tagId, sameNameIds(db, tagId)),
    isNull(sessionTags.deletedAt),
  );
}

/** No-op when the session already carries a tag of this name. */
export function addSessionTag(db: Database, sessionId: string, tagId: string) {
  const existing = db
    .select()
    .from(sessionTags)
    .where(liveLinks(db, sessionId, tagId))
    .get();
  if (existing) return;
  const now = nowIso();
  db.insert(sessionTags)
    .values({ id: newId(), createdAt: now, updatedAt: now, deletedAt: null, sessionId, tagId })
    .run();
}

/** Tombstones the session's live links to every tag of this name. */
export function removeSessionTag(db: Database, sessionId: string, tagId: string) {
  const now = nowIso();
  db.update(sessionTags)
    .set({ deletedAt: now, updatedAt: now })
    .where(liveLinks(db, sessionId, tagId))
    .run();
}

/** The session's tags, one per name, on the canonical id. */
export function listTagsForSession(db: Database, sessionId: string) {
  const all = allTags(db);
  const byId = new Map(all.map((tag) => [tag.id, tag]));
  const links = db.select().from(sessionTags).where(eq(sessionTags.sessionId, sessionId)).all();
  return liveSessionTags(all, links).map(({ tagId }) => {
    const { id, name, createdAt, updatedAt } = byId.get(tagId)!;
    return { id, name, createdAt, updatedAt };
  });
}

/**
 * Every session's tag names, keyed by session id — one query for a whole
 * list, so the Home screen does not run `listTagsForSession` per row.
 */
export function listTagsBySession(db: Database): Map<string, string[]> {
  return tagNamesBySession(allTags(db), allLinks(db));
}

/** Live links on canonical tag ids, as the Statistics builders take them. */
export function listLiveSessionTags(db: Database) {
  return liveSessionTags(allTags(db), allLinks(db));
}
