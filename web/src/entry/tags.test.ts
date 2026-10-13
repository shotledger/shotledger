import type { ShooterProfile } from '@shotledger/shared/src/disciplines';
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { EntryContext } from '@shotledger/shared/src/sync-client/session-entry';
import { describe, expect, it, vi } from 'vitest';

import { initialForm, sendsTheSame, toDraft, type EntryForm } from './model';
import { save } from './save';
import { addTag, removeTag, tagSuggestions } from './tags';

const NOW = new Date(2026, 9, 10, 9, 30);
const NO_PROFILE: ShooterProfile = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
};

const form = (tags: readonly string[] = []): EntryForm => ({
  ...initialForm(NOW, NO_PROFILE),
  tags,
});

const tag = (id: string, name: string, deletedAt: string | null = null) =>
  [id, { id, name, deleted_at: deletedAt }] as const;

describe('tags on the Enter Series form (docs/specs/web-entry-tags-spec.md §3.3)', () => {
  it('TU1 addTag cleans, ignores a blank or chosen name in any case, appends a new one', () => {
    const none = new Map();
    const empty = form();
    const one = addTag(empty, '  KM ', none);
    expect(one.tags).toEqual(['KM']);
    expect(addTag(one, 'Club  Night', none).tags).toEqual(['KM', 'Club Night']);
    // Case ignored (R2): `km` is the chosen KM.
    expect(addTag(one, 'km', none)).toBe(one);
    expect(addTag(one, ' KM', none)).toBe(one);
    expect(addTag(one, '   ', none)).toBe(one);
    expect(addTag(empty, '', none)).toBe(empty);
    expect(empty.tags).toEqual([]);
  });

  it("TU7 addTag takes an existing tag's spelling when the typed name differs only in case", () => {
    const tags = new Map([tag('t1', 'KM'), tag('t2', 'Club Night'), tag('t3', 'Old', 'gone')]);
    expect(addTag(form(), 'km', tags).tags).toEqual(['KM']);
    expect(addTag(form(), ' club   night', tags).tags).toEqual(['Club Night']);
    // A deleted tag's spelling is not offered: the typed one is kept.
    expect(addTag(form(), 'old', tags).tags).toEqual(['old']);
  });

  it('TU2 removeTag drops the name; removing an absent one changes nothing', () => {
    const two = form(['KM', 'Club']);
    expect(removeTag(two, 'KM').tags).toEqual(['Club']);
    expect(removeTag(two, 'Zone')).toBe(two);
    expect(two.tags).toEqual(['KM', 'Club']);
  });

  it('TU3 tagSuggestions: canonical live names, minus the chosen, sorted, each once', () => {
    const tags = new Map([
      tag('t3', 'Zone'),
      tag('t1', 'KM'),
      tag('t2', 'KM'),
      tag('t4', 'Club'),
      tag('t5', 'Gone', '2026-10-01T00:00:00.000Z'),
      tag('t6', 'Ärla'),
    ]);
    expect(tagSuggestions(tags, [])).toEqual(['Club', 'KM', 'Zone', 'Ärla']);
    expect(tagSuggestions(tags, ['KM', 'New'])).toEqual(['Club', 'Zone', 'Ärla']);
    // A chosen name hides its tag in any case (R2).
    expect(tagSuggestions(tags, ['km', 'ärla'])).toEqual(['Club', 'Zone']);
    expect(tagSuggestions(new Map([['t1', { id: 't1', name: 'KM' }]]), [])).toEqual(['KM']);
    expect(tagSuggestions(new Map(), [])).toEqual([]);
  });

  it('TU4 a tag edit is not sendsTheSame, so it drops a held request', () => {
    const before = form(['KM']);
    expect(sendsTheSame(before, addTag(before, 'Club', new Map()))).toBe(false);
    expect(sendsTheSame(before, removeTag(before, 'KM'))).toBe(false);
    expect(sendsTheSame(before, addTag(before, 'km', new Map()))).toBe(true);
  });

  it('TU5 initialForm has no tags, and the draft does not carry them', () => {
    expect(initialForm(NOW, NO_PROFILE).tags).toEqual([]);
    expect(toDraft(form(['KM']), 'Training')).toEqual(toDraft(form(), 'Training'));
  });

  it('TU6 save hands build the context loadContext returned, tags included', async () => {
    const context: EntryContext & { tags: Map<string, unknown> } = {
      firearms: new Map(),
      firearmGroups: [],
      ammoLots: new Map(),
      tags: new Map([['t1', { id: 't1' }]]),
    };
    const changes: ClientChange[] = [];
    const build = vi.fn((_: typeof context) => ({
      ok: true as const,
      sessionId: 's1',
      changes,
      photos: [],
    }));
    await save(
      {
        currentUserId: () => Promise.resolve('user-a'),
        loadContext: () => Promise.resolve(context),
        build,
        push: () => Promise.resolve({ kind: 'saved' }),
        refresh: () => Promise.resolve(true),
      },
      null,
    );
    expect(build).toHaveBeenCalledOnce();
    expect(build.mock.calls[0]![0]).toBe(context);
  });
});
