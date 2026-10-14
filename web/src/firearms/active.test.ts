import { describe, expect, it } from 'vitest';

import { isArchivedFirearm, pickableFirearms } from './active';

const rows = new Map<string, Record<string, unknown>>([
  ['a', { id: 'a', deleted_at: null, archived_at: null }],
  ['b', { id: 'b', deleted_at: null, archived_at: '2026-10-13T20:00:00.000Z' }],
  ['c', { id: 'c', deleted_at: '2026-10-01T00:00:00.000Z', archived_at: null }],
  // A row written before archived_at existed carries no key at all.
  ['d', { id: 'd' }],
]);

describe('pickableFirearms (#799)', () => {
  it('offers live firearms that are not archived', () => {
    expect([...pickableFirearms(rows).keys()]).toEqual(['a', 'd']);
  });

  it("keeps the session's own archived firearm, as the phone's edit screen does", () => {
    expect([...pickableFirearms(rows, 'b').keys()]).toEqual(['a', 'b', 'd']);
  });

  it('never brings back a deleted firearm', () => {
    expect([...pickableFirearms(rows, 'c').keys()]).toEqual(['a', 'd']);
  });
});

describe('isArchivedFirearm', () => {
  it('reads archived_at', () => {
    expect(isArchivedFirearm(rows.get('a')!)).toBe(false);
    expect(isArchivedFirearm(rows.get('b')!)).toBe(true);
    expect(isArchivedFirearm(rows.get('d')!)).toBe(false);
  });
});
