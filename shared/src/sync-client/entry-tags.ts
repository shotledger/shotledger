// The tags of a web-entered session, added to the entry's one push
// (docs/specs/web-entry-tags-spec.md §3.2). As the phone's getOrCreateTag +
// addSessionTag: a name links its canonical live tag, case ignored, else a new one.
import { PUSH_BATCH_MAX, type ClientChange, type SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { cleanTagName, sameTagName } from '../tags/canonical';
import { applyRank } from './order';
import type { Payload } from './rows';
import type { EntryDeps, EntryResult } from './session-entry';
import { canonicalTagId, newSessionTagRow, newTagRow } from './tag-rows';

/** Cleaned, blanks dropped, each tag once (case ignored) as first spelled. */
function distinctNames(names: readonly string[]): string[] {
  const result: string[] = [];
  for (const name of names.map(cleanTagName)) {
    if (name !== '' && !result.some((kept) => sameTagName(kept, name))) result.push(name);
  }
  return result;
}

export function withEntryTags(
  entry: EntryResult,
  names: readonly string[],
  tags: ReadonlyMap<string, Payload>,
  deps: EntryDeps,
): EntryResult {
  if (!entry.ok) return entry;
  const wanted = distinctNames(names);
  if (wanted.length === 0) return entry;
  const max = TEXT_LIMITS.tags.name;
  if (wanted.some((name) => name.length > max)) {
    return { ok: false, errors: [{ kind: 'tooLong', field: 'tag', max }] };
  }

  const now = deps.now();
  const added: ClientChange[] = [];
  const add = (tableName: SyncTableName, payload: Payload) =>
    added.push({
      clientChangeId: deps.newChangeId(),
      tableName,
      rowId: payload.id as string,
      payload,
      deletedAt: null,
      updatedAt: now,
    });
  for (const name of wanted) {
    let tagId = canonicalTagId(tags.values(), name);
    if (tagId === undefined) {
      tagId = deps.newId();
      add('tags', newTagRow(tagId, now, name));
    }
    add('session_tags', newSessionTagRow(deps.newId(), now, entry.sessionId, tagId));
  }

  // A stable sort keeps each table's rows in the order they were built.
  const changes = [...entry.changes, ...added].sort(
    (a, b) => applyRank(a.tableName) - applyRank(b.tableName),
  );
  if (changes.length > PUSH_BATCH_MAX) {
    return { ok: false, errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }] };
  }
  return { ok: true, sessionId: entry.sessionId, changes };
}
