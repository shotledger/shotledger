import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOST_DATE_GROUP_SIZE,
  SHOTLOG_SOURCE,
  findExactRefMatch,
  findLostDateTimestamps,
  findProbableDuplicates,
  markInFileDuplicates,
} from './dedup';
import { parsedSession } from './fixtures';
import type { ShotlogExistingSession, ShotlogSession } from './types';

function row(patch: Partial<ShotlogSession> & { line: number }): ShotlogSession {
  return parsedSession(patch);
}

/** A session ShotLog exported with no series — the "empty shadow". */
function shadow(patch: Partial<ShotlogSession> & { line: number }): ShotlogSession {
  return parsedSession({ ...patch, series: [] });
}

describe('findLostDateTimestamps', () => {
  it('defaults to a group size of three', () => {
    expect(DEFAULT_LOST_DATE_GROUP_SIZE).toBe(3);
  });

  it('flags a timestamp shared by three rows', () => {
    const rows = [1, 2, 3].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect([...findLostDateTimestamps(rows)]).toEqual(['2026-05-04T09:00:00.000Z']);
  });

  it('leaves a timestamp shared by two rows alone', () => {
    const rows = [1, 2].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect(findLostDateTimestamps(rows).size).toBe(0);
  });

  it('honors a custom group size', () => {
    const rows = [1, 2].map((line) => row({ line, name: `Club Cup ${line}` }));
    expect([...findLostDateTimestamps(rows, 2)]).toEqual(['2026-05-04T09:00:00.000Z']);
  });

  it('flags only the shared timestamp in a mixed file', () => {
    const rows = [
      row({ line: 2 }),
      row({ line: 3, name: 'B' }),
      row({ line: 4, name: 'C' }),
      row({ line: 5, datetime: '2026-06-01T09:00:00.000Z', name: 'D' }),
    ];
    expect([...findLostDateTimestamps(rows)]).toEqual(['2026-05-04T09:00:00.000Z']);
  });

  it('returns nothing for an empty file', () => {
    expect(findLostDateTimestamps([]).size).toBe(0);
  });
});

describe('markInFileDuplicates', () => {
  it('finds no duplicates among sessions with series, even with the same instant and name', () => {
    expect(markInFileDuplicates([row({ line: 2 }), row({ line: 3 })]).size).toBe(0);
  });

  it('marks an empty shadow that comes after its twin', () => {
    expect([...markInFileDuplicates([row({ line: 2 }), shadow({ line: 3 })])]).toEqual([[3, 2]]);
  });

  it('marks an empty shadow that comes before its twin, as in the real file', () => {
    expect([...markInFileDuplicates([shadow({ line: 2 }), row({ line: 3 })])]).toEqual([[2, 3]]);
  });

  it('points the shadow at the first twin with series', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2 }),
      row({ line: 3 }),
      shadow({ line: 4 }),
    ]);
    expect([...duplicates]).toEqual([[4, 2]]);
  });

  it('keeps an empty session with no twin', () => {
    expect(markInFileDuplicates([shadow({ line: 2 })]).size).toBe(0);
  });

  it('keeps two empty sessions that are only each other’s twin', () => {
    expect(markInFileDuplicates([shadow({ line: 2 }), shadow({ line: 3 })]).size).toBe(0);
  });

  it('needs the same name', () => {
    expect(markInFileDuplicates([row({ line: 2 }), shadow({ line: 3, name: 'B' })]).size).toBe(0);
  });

  it('needs the same local time', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2 }),
      shadow({ line: 3, localDatetime: '2026-05-04 11:00:01' }),
    ]);
    expect(duplicates.size).toBe(0);
  });

  it('does not run name and time together', () => {
    const duplicates = markInFileDuplicates([
      row({ line: 2, localDatetime: '2026-05-04 11:00:0', name: '0A' }),
      shadow({ line: 3, localDatetime: '2026-05-04 11:00:00', name: 'A' }),
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
    externalSource: 'shotlog',
    externalRef: 'S-0000beef',
  },
  {
    id: 's2',
    name: 'Spring Open C',
    startedAt: '2026-05-04T12:00:00Z',
    disciplineId: 'spsf-milsnabb',
    weaponGroup: 'spsf:C',
    externalSource: 'webshooter',
    externalRef: 'S-1234abcd',
  },
];

describe('findExactRefMatch', () => {
  it('names the ShotLog source', () => {
    expect(SHOTLOG_SOURCE).toBe('shotlog');
  });

  it('finds a ShotLog session by external ref', () => {
    expect(findExactRefMatch(EXISTING, 'S-0000beef')?.id).toBe('s1');
  });

  it('returns null for an unknown ref', () => {
    expect(findExactRefMatch(EXISTING, 'S-00000000')).toBeNull();
  });

  it('never matches another source’s session with the same ref', () => {
    expect(findExactRefMatch(EXISTING, 'S-1234abcd')).toBeNull();
  });

  it('never matches a session with no external ref', () => {
    const local = [{ ...EXISTING[0]!, id: 'local', externalSource: null, externalRef: null }];
    expect(findExactRefMatch(local, 'S-0000beef')).toBeNull();
  });
});

describe('findProbableDuplicates', () => {
  it('matches on calendar day + discipline + weapon group', () => {
    const found = findProbableDuplicates(EXISTING, {
      datetime: '2026-05-04T09:00:00.000Z',
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
        datetime: '2026-05-04T09:00:00.000Z',
        disciplineId: 'spsf-falling-target',
        weaponGroup: 'spsf:C',
      }),
    ).toEqual([]);
  });

  it('does not match a different weapon group', () => {
    expect(
      findProbableDuplicates(EXISTING, {
        datetime: '2026-05-04T09:00:00.000Z',
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
      findProbableDuplicates(EXISTING, { datetime: '2026-05-04T09:00:00.000Z', ...patch }),
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
        externalSource: null,
        externalRef: null,
      },
    ];
    expect(
      findProbableDuplicates(mirrored, { datetime: '2026-05-04T09:00:00.000Z', ...patch }),
    ).toEqual([]);
  });
});
