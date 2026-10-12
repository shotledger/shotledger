import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  canonicalTags,
  cleanTagName,
  findTag,
  findTagName,
  liveSessionTags,
  sameTagName,
  tagNamesBySession,
  type SessionTagRecord,
  type TagRecord,
} from './canonical';

// docs/specs/sync-tags-settings-spec.md §2.8, scenarios N1–N4.

const tag = (id: string, name: string, deletedAt: string | null = null): TagRecord => ({
  id,
  name,
  deletedAt,
});
const link = (sessionId: string, tagId: string, deletedAt: string | null = null) => ({
  sessionId,
  tagId,
  deletedAt,
});
const GONE = '2026-10-06T00:00:00.000Z';

describe('canonicalTags', () => {
  it('N1 duplicate live names collapse to the earliest id; tombstones never count', () => {
    const tags = [tag('01b', 'KM'), tag('01a', 'KM'), tag('010', 'KM', GONE), tag('01c', 'Cup')];
    expect(canonicalTags(tags)).toEqual([
      { id: '01c', name: 'Cup' },
      { id: '01a', name: 'KM' },
    ]);
  });

  it('drops a name whose every copy is deleted', () => {
    expect(canonicalTags([tag('01a', 'KM', GONE)])).toEqual([]);
  });

  it('keeps names that differ only in case apart, sorted in binary order', () => {
    expect(canonicalTags([tag('1', 'km'), tag('2', 'KM'), tag('3', 'Ärm')])).toEqual([
      { id: '2', name: 'KM' },
      { id: '1', name: 'km' },
      { id: '3', name: 'Ärm' },
    ]);
  });
});

// docs/specs/web-entry-tags-spec.md §3.0 (R2), scenarios TN1–TN5: the one
// lookup rule the phone and the web share.
describe('tag name lookup', () => {
  it('TN1 cleanTagName trims and makes each run of whitespace one space', () => {
    expect(cleanTagName('  Club \t Night\n')).toBe('Club Night');
    expect(cleanTagName('KM')).toBe('KM');
    expect(cleanTagName('   ')).toBe('');
  });

  it('TN2 sameTagName ignores case and spacing, nothing else', () => {
    expect(sameTagName('KM', 'km')).toBe(true);
    expect(sameTagName(' Club  night', 'club Night ')).toBe(true);
    expect(sameTagName('Ärm', 'äRM')).toBe(true);
    expect(sameTagName('KM', 'KM2')).toBe(false);
    expect(sameTagName('Club Night', 'ClubNight')).toBe(false);
  });

  it('TN3 findTagName: the own spelling first, else the first of another case, else none', () => {
    expect(findTagName(['KM', 'km'], 'km')).toBe('km');
    expect(findTagName(['KM', 'km'], 'Km')).toBe('KM');
    expect(findTagName(['Cup', 'KM'], ' km ')).toBe('KM');
    expect(findTagName(['Cup'], 'KM')).toBeUndefined();
    expect(findTagName([], 'KM')).toBeUndefined();
  });

  it('TN4 findTag: the canonical live tag of the name in any case; deleted copies skipped', () => {
    const tags = [tag('01b', 'KM'), tag('01a', 'KM'), tag('009', 'km', GONE), tag('01c', 'Cup')];
    expect(findTag(tags, 'km')).toEqual({ id: '01a', name: 'KM' });
    expect(findTag(tags, '  CUP ')).toEqual({ id: '01c', name: 'Cup' });
    expect(findTag(tags, 'Club')).toBeUndefined();
    expect(findTag([tag('01a', 'KM', GONE)], 'KM')).toBeUndefined();
  });

  it('TN5 findTag prefers the exact spelling when two live names differ only in case', () => {
    const tags = [tag('2', 'km'), tag('1', 'KM')];
    expect(findTag(tags, 'km')).toEqual({ id: '2', name: 'km' });
    expect(findTag(tags, 'KM')).toEqual({ id: '1', name: 'KM' });
    expect(findTag(tags, 'Km')).toEqual({ id: '1', name: 'KM' });
  });

  it('TN6 property: findTag finds a live tag exactly when one is the same tag', () => {
    const tagArb = fc.array(
      fc.record({
        id: fc.constantFrom('a', 'b', 'c', 'd'),
        name: fc.constantFrom('KM', 'km', 'Cup', 'Club Night', 'club  night'),
        deletedAt: fc.constantFrom(null, GONE),
      }),
    );
    const typedArb = fc.constantFrom('KM', ' km', 'cup', 'Club night', 'Zone', '');
    fc.assert(
      fc.property(tagArb, typedArb, (tags, typed) => {
        const found = findTag(tags, typed);
        const live = canonicalTags(tags);
        const any = live.some((t) => sameTagName(t.name, typed));
        expect(found !== undefined).toBe(any);
        if (found !== undefined) {
          expect(live).toContainEqual(found);
          expect(sameTagName(found.name, typed)).toBe(true);
        }
      }),
    );
  });
});

describe('liveSessionTags', () => {
  it('N2 links to either copy map to the canonical id, once per session', () => {
    const tags = [tag('01a', 'KM'), tag('01b', 'KM')];
    const links = [link('s1', '01a'), link('s1', '01b'), link('s2', '01b'), link('s2', '01b')];
    expect(liveSessionTags(tags, links)).toEqual([
      { sessionId: 's1', tagId: '01a' },
      { sessionId: 's2', tagId: '01a' },
    ]);
  });

  it('N3 drops tombstoned links, links to deleted tags, and links to unknown tags', () => {
    const tags = [tag('01a', 'KM'), tag('01d', 'Old', GONE)];
    const links = [link('s1', '01a', GONE), link('s2', '01d'), link('s3', 'missing')];
    expect(liveSessionTags(tags, links)).toEqual([]);
  });

  it('N3b a link to a deleted tag stays dropped when the name is re-created', () => {
    const tags = [tag('01a', 'KM', GONE), tag('01b', 'KM')];
    expect(liveSessionTags(tags, [link('s1', '01a')])).toEqual([]);
  });

  it('keeps a link to a live copy when another copy of the name is deleted', () => {
    const tags = [tag('01a', 'KM', GONE), tag('01b', 'KM')];
    expect(liveSessionTags(tags, [link('s1', '01b')])).toEqual([{ sessionId: 's1', tagId: '01b' }]);
  });

  it('every result is a live, canonical, distinct pair (property)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const tagArb = fc
      .uniqueArray(
        fc.record({
          id: fc.constantFrom(...ids),
          name: fc.constantFrom('KM', 'Cup', 'km'),
          deletedAt: fc.constantFrom(null, GONE),
        }),
        { selector: (t) => t.id },
      )
      .map((rows) => rows as TagRecord[]);
    const linkArb = fc.array(
      fc.record({
        sessionId: fc.constantFrom('s1', 's2', 's3'),
        tagId: fc.constantFrom(...ids),
        deletedAt: fc.constantFrom(null, GONE),
      }),
    );
    fc.assert(
      fc.property(tagArb, linkArb, (tags, links: SessionTagRecord[]) => {
        const canonical = new Map(canonicalTags(tags).map((t) => [t.id, t.name]));
        const result = liveSessionTags(tags, links);
        const keys = result.map((r) => `${r.sessionId}|${r.tagId}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const r of result) expect(canonical.has(r.tagId)).toBe(true);
        // Completeness: every live link to a live tag is represented by its name.
        const byId = new Map(tags.map((t) => [t.id, t]));
        for (const l of links) {
          const t = byId.get(l.tagId);
          if (l.deletedAt !== null || !t || t.deletedAt !== null) continue;
          expect(
            result.some((r) => r.sessionId === l.sessionId && canonical.get(r.tagId) === t.name),
          ).toBe(true);
        }
      }),
    );
  });
});

describe('tagNamesBySession', () => {
  it('N4 lists each live name once per session, sorted', () => {
    const tags = [tag('01a', 'KM'), tag('01b', 'KM'), tag('01c', 'Cup'), tag('01d', 'X', GONE)];
    const links = [
      link('s1', '01b'),
      link('s1', '01a'),
      link('s1', '01c'),
      link('s1', '01d'),
      link('s2', '01c', GONE),
    ];
    expect(tagNamesBySession(tags, links)).toEqual(new Map([['s1', ['Cup', 'KM']]]));
  });
});
