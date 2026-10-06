import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  canonicalTags,
  liveSessionTags,
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
