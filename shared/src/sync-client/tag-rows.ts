// Whole-row payloads for tags and tag links, and the canonical tag of a name
// (docs/specs/web-entry-tags-spec.md §3.1). Shared by the web's bulk edit and
// series entry; the keys are the app's column names.
import { findTag } from '../tags/canonical';
import type { Payload } from './rows';

const common = (id: string, now: string) => ({
  id,
  created_at: now,
  updated_at: now,
  deleted_at: null,
});

/** The phone's createTag. */
export function newTagRow(id: string, now: string, name: string): Payload {
  return { ...common(id, now), name };
}

export function newSessionTagRow(
  id: string,
  now: string,
  sessionId: string,
  tagId: string,
): Payload {
  return { ...common(id, now), session_id: sessionId, tag_id: tagId };
}

/** The canonical live tag a typed name adds, case and spacing ignored (findTag), if any. */
export function canonicalTagId(tags: Iterable<Payload>, typed: string): string | undefined {
  const records = [...tags].map((tag) => ({
    id: tag.id as string,
    name: tag.name as string,
    deletedAt: (tag.deleted_at as string | null | undefined) ?? null,
  }));
  return findTag(records, typed)?.id;
}
