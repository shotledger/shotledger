// The Tags field of Enter Series (docs/specs/web-entry-tags-spec.md §3.3): a
// list of names, added under the phone's rule — case and spacing ignored, an
// existing tag's spelling kept (findTagName, shared/src/tags/canonical.ts).
import {
  canonicalTags,
  cleanTagName,
  findTagName,
  sameTagName,
} from '@shotledger/shared/src/tags/canonical';

import type { EntryForm } from './model';

type TagRows = ReadonlyMap<string, Record<string, unknown>>;

/** The account's live tag names, one per name, sorted as readers sort them. */
function liveTagNames(tags: TagRows): string[] {
  const records = [...tags.values()].map((row) => ({
    id: String(row.id),
    name: String(row.name),
    deletedAt: (row.deleted_at as string | null | undefined) ?? null,
  }));
  return canonicalTags(records).map((tag) => tag.name);
}

/** The live tag names that are not the same tag as one already chosen. */
export function tagSuggestions(tags: TagRows, chosen: readonly string[]): string[] {
  return liveTagNames(tags).filter((name) => !chosen.some((c) => sameTagName(c, name)));
}

/**
 * Cleaned; a blank name or one already chosen in any case changes nothing.
 * A name the account has in another case is added in its spelling, as the
 * phone's TagSelect.
 */
export function addTag(form: EntryForm, typed: string, tags: TagRows): EntryForm {
  const name = cleanTagName(typed);
  if (name === '' || form.tags.some((chosen) => sameTagName(chosen, name))) return form;
  return { ...form, tags: [...form.tags, findTagName(liveTagNames(tags), name) ?? name] };
}

export function removeTag(form: EntryForm, name: string): EntryForm {
  if (!form.tags.includes(name)) return form;
  return { ...form, tags: form.tags.filter((tag) => tag !== name) };
}
