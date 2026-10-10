// The Tags field of Enter Series (docs/specs/web-entry-tags-spec.md §3.3): a
// list of names, as the phone's session edit adds them (getOrCreateTag runs
// in shared/src/sync-client/entry-tags.ts when the push is built).
import { canonicalTags } from '@shotledger/shared/src/tags/canonical';

import type { EntryForm } from './model';

/** The account's live tag names not chosen yet, one per name, sorted as readers sort them. */
export function tagSuggestions(
  tags: ReadonlyMap<string, Record<string, unknown>>,
  chosen: readonly string[],
): string[] {
  const records = [...tags.values()].map((row) => ({
    id: String(row.id),
    name: String(row.name),
    deletedAt: (row.deleted_at as string | null | undefined) ?? null,
  }));
  return canonicalTags(records)
    .map((tag) => tag.name)
    .filter((name) => !chosen.includes(name));
}

/** Trimmed; a blank or already chosen name changes nothing, as the phone's addSessionTag. */
export function addTag(form: EntryForm, typed: string): EntryForm {
  const name = typed.trim();
  if (name === '' || form.tags.includes(name)) return form;
  return { ...form, tags: [...form.tags, name] };
}

export function removeTag(form: EntryForm, name: string): EntryForm {
  if (!form.tags.includes(name)) return form;
  return { ...form, tags: form.tags.filter((tag) => tag !== name) };
}
