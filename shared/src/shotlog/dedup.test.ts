import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOST_DATE_GROUP_SIZE,
  findExactRefMatch,
  findLostDateTimestamps,
  findProbableDuplicates,
  markInFileDuplicates,
} from './dedup';
import type { ShotlogExistingSession, ShotlogRow } from './types';

function row(patch: Partial<ShotlogRow> & { line: number }): ShotlogRow {
  return {
    datetime: '2026-05-04T09:00:00Z',
    name: 'Club Cup A',
    sourceType: 'Practice',
    totalScore: 300,
    tenCount: 5,
    innerTenCount: 2,
    tags: [],
    note: '',
    warnings: [],
    ...patch,
  };
}

describe('findLostDateTimestamps', () => {
  it('defaults to a group size of three', () => {
    expect(DEFAULT_LOST_DATE_GROUP_SIZE).toBe(3);
  });

  it('flags a timestamp shared by three rows', () => {
    const rows = [1, 2, 3].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect([...findLostDateTimestamps(rows)]).toEqual(['2026-05-04T09:00:00Z']);
  });

  it('leaves a timestamp shared by two rows alone', () => {
    const rows = [1, 2].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect(findLostDateTimestamps(rows).size).toBe(0);
  });

  it('honors a custom group size', () => {
    const rows = [1, 2].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect([...findLostDateTimestamps(rows, 2)]).toEqual(['2026-05-04T09:00:00Z']);
  });

  it('flags only the shared timestamp in a mixed file', () => {
    const rows = [
      row({ line: 2 }),
      row({ line: 3, name: 'B' }),
      row({ line: 4, name: 'C' }),
      row({ line: 5, datetime: '2026-06-01T09:00:00Z', name: 'D' }),
    ];
    expect([...findLostDateTimestamps(rows)]).toEqual(['2026-05-04T09:00:00Z']);
  });

  it('returns nothing for an empty file', () => {
    expect(findLostDateTimestamps([]).size).toBe(0);
  });
});

describe('markInFileDuplicates', () => {
  it('finds no duplicates among distinct rows', () => {
    expect(markInFileDuplicates([row({ line: 2 }), row({ line: 3, name: 'B' })]).size).toBe(0);
  });

  it('marks a byte-identical repeat against the first occurrence', () => {
    const duplicates = markInFileDuplicates([row({ line: 2 }), row({ line: 3 }), row({ line: 4 })]);
    expect([...duplicates]).toEqual([
      [3, 2],
      [4, 2],
    ]);
  });

  it('marks a zero-total shadow row against its earlier scored twin', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, totalScore: 326 }),
      row({ line: 3, totalScore: 0, tenCount: 0, innerTenCount: 0 }),
    ]);
    expect(duplicates.get(3)).toBe(2);
  });

  it('keeps a zero-total row that comes FIRST, and imports the scored twin', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, totalScore: 0, tenCount: 0, innerTenCount: 0 }),
      row({ line: 3, totalScore: 326 }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('does not treat same-day same-name rows with different scores as duplicates', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, name: 'Club training', totalScore: 300 }),
      row({ line: 3, name: 'Club training', totalScore: 288 }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('does not link a zero-total row to a different name at the same instant', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, name: 'Club Cup A', totalScore: 300 }),
      row({ line: 3, name: 'Spring Open C', totalScore: 0 }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('keeps the first scored row as the anchor when two scored twins precede a shadow', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, totalScore: 300 }),
      row({ line: 3, totalScore: 288 }),
      row({ line: 4, totalScore: 0 }),
    ]);
    expect(duplicates.get(4)).toBe(2);
  });

  it('distinguishes rows differing only in tags or note', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, tags: ['Precision'] }),
      row({ line: 3, tags: ['Milsnabb'] }),
      row({ line: 4, tags: ['Precision'], note: 'windy' }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('distinguishes tag lists that differ only in where the boundaries fall', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, tags: ['a', 'b'] }),
      row({ line: 3, tags: ['ab'] }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('distinguishes rows whose fields differ only in where the boundaries fall', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, name: 'ClubA', sourceType: 'B' }),
      row({ line: 3, name: 'Club', sourceType: 'AB' }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('distinguishes rows differing only in the source type or counts', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2 }),
      row({ line: 3, sourceType: 'Competition' }),
      row({ line: 4, tenCount: 9 }),
      row({ line: 5, innerTenCount: 9 }),
    ]);
    expect(duplicates.size).toBe(0);
  });
});

const EXISTING: ShotlogExistingSession[] = [
  {
    id: 's1',
    name: 'Club Cup A',
    startedAt: '2026-05-04T07:30:00Z',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    externalRef: 'shotlog:00000000deadbeef',
  },
  {
    id: 's2',
    name: 'Spring Open C',
    startedAt: '2026-05-04T12:00:00Z',
    disciplineId: 'spsf-milsnabb',
    weaponGroup: 'spsf:C',
    externalRef: 'webshooter:1:2',
  },
];

describe('findExactRefMatch', () => {
  it('finds a session by external ref', () => {
    expect(findExactRefMatch(EXISTING, 'shotlog:00000000deadbeef')?.id).toBe('s1');
  });

  it('returns null for an unknown ref', () => {
    expect(findExactRefMatch(EXISTING, 'shotlog:0000000000000000')).toBeNull();
  });

  it('never matches a session with no external ref against a null-ish ref', () => {
    const local = [{ ...EXISTING[0]!, id: 'local', externalRef: null }];
    expect(findExactRefMatch(local, 'shotlog:00000000deadbeef')).toBeNull();
  });
});

describe('findProbableDuplicates', () => {
  it('matches on calendar day + discipline + weapon group', () => {
    const found = findProbableDuplicates(EXISTING, {
      datetime: '2026-05-04T09:00:00Z',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
    });
    expect(found.map((s) => s.id)).toEqual(['s1']);
  });

  it('matches a Webshooter-imported session too', () => {
    const found = findProbableDuplicates(EXISTING, {
      datetime: '2026-05-04T23:59:59Z',
      disciplineId: 'spsf-milsnabb',
      weaponGroup: 'spsf:C',
    });
    expect(found.map((s) => s.id)).toEqual(['s2']);
  });

  it('does not match a different day', () => {
    expect(
      findProbableDuplicates(EXISTING, {
        datetime: '2026-05-05T09:00:00Z',
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
      }),
    ).toEqual([]);
  });

  it('does not match a different discipline', () => {
    expect(
      findProbableDuplicates(EXISTING, {
        datetime: '2026-05-04T09:00:00Z',
        disciplineId: 'spsf-falling-target',
        weaponGroup: 'spsf:C',
      }),
    ).toEqual([]);
  });

  it('does not match a different weapon group', () => {
    expect(
      findProbableDuplicates(EXISTING, {
        datetime: '2026-05-04T09:00:00Z',
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:A',
      }),
    ).toEqual([]);
  });

  it.each([
    ['discipline', { disciplineId: null, weaponGroup: 'spsf:C' }],
    ['weapon group', { disciplineId: 'spsf-precision', weaponGroup: null }],
    ['both', { disciplineId: null, weaponGroup: null }],
  ])('yields nothing when the %s is unresolved', (_label, patch) => {
    expect(
      findProbableDuplicates(EXISTING, { datetime: '2026-05-04T09:00:00Z', ...patch }),
    ).toEqual([]);
  });

  // Without the unresolved-suggestion guard, `null === null` would read as
  // agreement: a row we could not classify would "match" a session with the
  // same gap. Each case mirrors the candidate's nulls onto a same-day session.
  it.each([
    ['both', { disciplineId: null, weaponGroup: null }],
    ['the discipline', { disciplineId: null, weaponGroup: 'spsf:C' }],
    ['the weapon group', { disciplineId: 'spsf-precision', weaponGroup: null }],
  ])('never matches a session sharing %s gap', (_label, patch) => {
    const mirrored: ShotlogExistingSession[] = [
      {
        id: 's3',
        name: 'Unclassified',
        startedAt: '2026-05-04T06:00:00Z',
        disciplineId: patch.disciplineId,
        weaponGroup: patch.weaponGroup,
        externalRef: null,
      },
    ];
    expect(
      findProbableDuplicates(mirrored, { datetime: '2026-05-04T09:00:00Z', ...patch }),
    ).toEqual([]);
  });
});
