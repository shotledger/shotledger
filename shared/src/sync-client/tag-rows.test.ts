import { describe, expect, it } from 'vitest';

import { canonicalTagId, newSessionTagRow, newTagRow } from './tag-rows';

const NOW = '2026-10-10T08:00:00.000Z';

const tag = (id: string, name: string, deletedAt: string | null = null) => ({
  id,
  name,
  deleted_at: deletedAt,
});

describe('tag rows (docs/specs/web-entry-tags-spec.md §3.1)', () => {
  it('G1 newTagRow carries every column of the phone tags table', () => {
    expect(newTagRow('t1', NOW, 'KM')).toStrictEqual({
      id: 't1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      name: 'KM',
    });
  });

  it('G2 newSessionTagRow carries every column of session_tags', () => {
    expect(newSessionTagRow('l1', NOW, 's1', 't1')).toStrictEqual({
      id: 'l1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      session_id: 's1',
      tag_id: 't1',
    });
  });

  describe('G3 canonicalTagId', () => {
    it('is the smallest live id among the tags of exactly that name', () => {
      const tags = [tag('t3', 'KM'), tag('t2', 'KM'), tag('t1', 'Club'), tag('t4', 'KM')];
      expect(canonicalTagId(tags, 'KM')).toBe('t2');
      expect(canonicalTagId(tags, 'Club')).toBe('t1');
    });

    it('skips a deleted copy', () => {
      const tags = [tag('t1', 'KM', NOW), tag('t2', 'KM')];
      expect(canonicalTagId(tags, 'KM')).toBe('t2');
      expect(canonicalTagId([tag('t1', 'KM', NOW)], 'KM')).toBeUndefined();
    });

    it('treats a missing deleted_at as live, as the pulled rows may omit it', () => {
      expect(canonicalTagId([{ id: 't1', name: 'KM' }], 'KM')).toBe('t1');
    });

    it('matches the exact string: another case or padding is another name', () => {
      const tags = [tag('t1', 'KM')];
      expect(canonicalTagId(tags, 'km')).toBeUndefined();
      expect(canonicalTagId(tags, ' KM')).toBeUndefined();
      expect(canonicalTagId([], 'KM')).toBeUndefined();
    });
  });
});
