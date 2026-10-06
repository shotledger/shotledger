// Tag names are not unique on disk: two devices can create the same name
// offline, and a deleted tag can be created again (ADR 0019). Readers resolve
// a name to its canonical tag — the live one with the smallest id, which for
// a UUIDv7 is the earliest created (docs/specs/sync-tags-settings-spec.md §2.8).

export interface TagRecord {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: string | null;
}

export interface SessionTagRecord {
  readonly sessionId: string;
  readonly tagId: string;
  readonly deletedAt: string | null;
}

export interface CanonicalTag {
  id: string;
  name: string;
}

/** Binary order, as SQLite's `ORDER BY name`; only ever given distinct names. */
const byBinary = (a: string, b: string) => (a < b ? -1 : 1);

/** Live tags, one per name with its canonical id, sorted by name. */
export function canonicalTags(tags: readonly TagRecord[]): CanonicalTag[] {
  const byName = new Map<string, string>();
  for (const tag of tags) {
    if (tag.deletedAt !== null) continue;
    const current = byName.get(tag.name);
    if (current === undefined || tag.id < current) byName.set(tag.name, tag.id);
  }
  return [...byName.entries()]
    .map(([name, id]) => ({ id, name }))
    .sort((a, b) => byBinary(a.name, b.name));
}

/** Tag id -> its name's canonical id, for every live tag. */
function canonicalIdOf(tags: readonly TagRecord[]): Map<string, CanonicalTag> {
  const canonical = new Map(canonicalTags(tags).map((tag) => [tag.name, tag]));
  const result = new Map<string, CanonicalTag>();
  for (const tag of tags) {
    if (tag.deletedAt !== null) continue;
    result.set(tag.id, canonical.get(tag.name)!);
  }
  return result;
}

/** Live links to live tags, each on its canonical tag id, one per pair. */
export function liveSessionTags(
  tags: readonly TagRecord[],
  links: readonly SessionTagRecord[],
): { sessionId: string; tagId: string }[] {
  const canonical = canonicalIdOf(tags);
  const seen = new Set<string>();
  const result: { sessionId: string; tagId: string }[] = [];
  for (const link of links) {
    if (link.deletedAt !== null) continue;
    const tag = canonical.get(link.tagId);
    if (tag === undefined) continue;
    const key = `${link.sessionId}\u0000${tag.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ sessionId: link.sessionId, tagId: tag.id });
  }
  return result;
}

/** Each session's live tag names, once each, sorted. */
export function tagNamesBySession(
  tags: readonly TagRecord[],
  links: readonly SessionTagRecord[],
): Map<string, string[]> {
  const names = new Map(canonicalTags(tags).map((tag) => [tag.id, tag.name]));
  const result = new Map<string, string[]>();
  for (const { sessionId, tagId } of liveSessionTags(tags, links)) {
    const bucket = result.get(sessionId) ?? [];
    bucket.push(names.get(tagId)!);
    result.set(sessionId, bucket);
  }
  for (const bucket of result.values()) bucket.sort(byBinary);
  return result;
}
