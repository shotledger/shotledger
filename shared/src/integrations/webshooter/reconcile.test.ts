import { describe, expect, it } from 'vitest';
import {
  buildExternalRef,
  classifyMergeField,
  findExactMatch,
  findHeuristicCandidates,
  mergeSessionFields,
  nameSimilarity,
} from './reconcile';

describe('buildExternalRef', () => {
  it('builds the stable webshooter:<competition>:<signup> key', () => {
    expect(buildExternalRef(9001, 55001)).toBe('webshooter:9001:55001');
  });

  it('accepts string ids too', () => {
    expect(buildExternalRef('9001', '55001')).toBe('webshooter:9001:55001');
  });
});

describe('findExactMatch', () => {
  const sessions = [
    { id: 's1', externalRef: 'webshooter:1:1' },
    { id: 's2', externalRef: null },
    { id: 's3', externalRef: 'webshooter:2:2' },
  ];

  it('finds the session with the matching externalRef', () => {
    expect(findExactMatch(sessions, 'webshooter:2:2')).toEqual(sessions[2]);
  });

  it('returns null when no session has that externalRef (fresh import, never a duplicate)', () => {
    expect(findExactMatch(sessions, 'webshooter:9:9')).toBeNull();
  });

  it('never matches a null externalRef against a null query implicitly', () => {
    expect(findExactMatch(sessions, 'null')).toBeNull();
  });
});

describe('nameSimilarity', () => {
  it('is 1 for identical strings', () => {
    expect(nameSimilarity('KM Precision C', 'KM Precision C')).toBe(1);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(nameSimilarity('KM Precision C', '  km   precision c  ')).toBe(1);
  });

  it('is lower for a longer, related but different string', () => {
    const similarity = nameSimilarity('KM Precision C', 'KM Precision C 2024');
    expect(similarity).toBeGreaterThan(0.6);
    expect(similarity).toBeLessThan(1);
  });

  it('is low for unrelated strings', () => {
    expect(nameSimilarity('KM Precision C', 'Vårtävling Militär snabbmatch')).toBeLessThan(0.4);
  });

  it('handles an empty-string pair without dividing by zero', () => {
    expect(nameSimilarity('', '')).toBe(1);
  });

  it('matches the classic Levenshtein "kitten"/"sitting" distance (3 edits, similarity 4/7)', () => {
    expect(nameSimilarity('kitten', 'sitting')).toBeCloseTo(4 / 7, 10);
  });

  it('collapses internal whitespace to a single space, never strips it entirely', () => {
    // "A B" and "AB" differ by one character once whitespace is collapsed
    // (not removed) to a single space: edit distance 1 over max length 3.
    expect(nameSimilarity('A B', 'AB')).toBeCloseTo(1 - 1 / 3, 10);
  });
});

describe('findHeuristicCandidates', () => {
  const existing = [
    {
      id: 'a',
      externalRef: null,
      date: '2026-06-13T09:00:00.000Z',
      eventName: 'KM Precision C',
      weaponGroup: 'spsf:C',
    },
    {
      id: 'b-already-linked',
      externalRef: 'webshooter:1:1',
      date: '2026-06-13T09:00:00.000Z',
      eventName: 'KM Precision C',
      weaponGroup: 'spsf:C',
    },
    {
      id: 'c-different-day',
      externalRef: null,
      date: '2026-06-14T09:00:00.000Z',
      eventName: 'KM Precision C',
      weaponGroup: 'spsf:C',
    },
    {
      id: 'd-different-weapon-group',
      externalRef: null,
      date: '2026-06-13T09:00:00.000Z',
      eventName: 'KM Precision C',
      weaponGroup: 'spsf:A',
    },
    {
      id: 'e-unrelated-name',
      externalRef: null,
      date: '2026-06-13T09:00:00.000Z',
      eventName: 'Vårtävling Militär snabbmatch',
      weaponGroup: 'spsf:C',
    },
  ];
  const candidate = { date: '2026-06-13', eventName: 'KM Precision C', weaponGroup: 'spsf:C' };

  it('finds the same-day/event/weapon-group candidate, excluding already-linked sessions', () => {
    const candidates = findHeuristicCandidates(existing, candidate);
    expect(candidates.map((s) => s.id)).toEqual(['a']);
  });

  it('excludes a different calendar day', () => {
    const candidates = findHeuristicCandidates(existing, candidate);
    expect(candidates.some((s) => s.id === 'c-different-day')).toBe(false);
  });

  it('excludes a different weapon group', () => {
    const candidates = findHeuristicCandidates(existing, candidate);
    expect(candidates.some((s) => s.id === 'd-different-weapon-group')).toBe(false);
  });

  it('excludes a name below the similarity threshold', () => {
    const candidates = findHeuristicCandidates(existing, candidate);
    expect(candidates.some((s) => s.id === 'e-unrelated-name')).toBe(false);
  });

  it('respects a custom minNameSimilarity option', () => {
    const strict = findHeuristicCandidates(
      existing,
      { ...candidate, eventName: 'KM Precision C 2024' },
      {
        minNameSimilarity: 0.95,
      },
    );
    expect(strict).toHaveLength(0);
  });

  it('includes a candidate exactly at the minNameSimilarity threshold (>=, not >)', () => {
    const atThreshold = findHeuristicCandidates(existing, candidate, {
      minNameSimilarity: nameSimilarity(candidate.eventName, existing[0]!.eventName),
    });
    expect(atThreshold.map((s) => s.id)).toContain('a');
  });
});

describe('classifyMergeField', () => {
  it.each([
    ['seriesOverrides', 'score'],
    ['officialPlacement', 'score'],
    ['officialStandardmedalj', 'score'],
    ['competitionName', 'score'],
    ['competitionDate', 'score'],
    ['firearmId', 'enrichment'],
    ['ammoLotId', 'enrichment'],
    ['notes', 'enrichment'],
    ['seriesPhotoUri', 'enrichment'],
    ['tags', 'enrichment'],
    ['somethingElse', 'unknown'],
  ])('classifyMergeField(%p) === %p', (field, expected) => {
    expect(classifyMergeField(field)).toBe(expected);
  });
});

describe('mergeSessionFields', () => {
  it('always overwrites score-bearing fields, even to a smaller value', () => {
    const { merged } = mergeSessionFields(
      { officialPlacement: 1, notes: '' },
      { officialPlacement: 5 },
    );
    expect(merged.officialPlacement).toBe(5);
  });

  it('fills an empty enrichment field', () => {
    const { merged } = mergeSessionFields<{ notes: string | null }>(
      { notes: null },
      { notes: 'from webshooter' },
    );
    expect(merged.notes).toBe('from webshooter');
  });

  it('fills an empty-string enrichment field', () => {
    const { merged } = mergeSessionFields({ notes: '' }, { notes: 'from webshooter' });
    expect(merged.notes).toBe('from webshooter');
  });

  it('never clobbers a user-entered enrichment field', () => {
    const { merged } = mergeSessionFields(
      { firearmId: 'user-firearm' },
      { firearmId: 'webshooter-would-be-firearm' },
    );
    expect(merged.firearmId).toBe('user-firearm');
  });

  it('fills an undefined (not just null/empty-string) enrichment field', () => {
    const { merged } = mergeSessionFields<{ firearmId: string | undefined }>(
      { firearmId: undefined },
      { firearmId: 'from webshooter' },
    );
    expect(merged.firearmId).toBe('from webshooter');
  });

  it('a full re-import: score changes, enrichment (firearm/notes/photo) stays', () => {
    const existing = {
      officialPlacement: 3,
      officialStandardmedalj: 'brons',
      firearmId: 'my-glock',
      notes: 'good day',
      seriesPhotoUri: 'file://photo.jpg',
    };
    const { merged } = mergeSessionFields(existing, {
      officialPlacement: 1,
      officialStandardmedalj: 'silver',
      firearmId: 'ignored',
      notes: 'ignored',
      seriesPhotoUri: 'ignored',
    });
    expect(merged.officialPlacement).toBe(1);
    expect(merged.officialStandardmedalj).toBe('silver');
    expect(merged.firearmId).toBe('my-glock');
    expect(merged.notes).toBe('good day');
    expect(merged.seriesPhotoUri).toBe('file://photo.jpg');
  });

  it('drops an unclassified field and reports it in unknownFields', () => {
    const { merged, unknownFields } = mergeSessionFields({ mystery: 'old' }, { mystery: 'new' });
    expect(merged.mystery).toBe('old');
    expect(unknownFields).toEqual(['mystery']);
  });

  it('returns an empty unknownFields array when nothing is unclassified', () => {
    const { unknownFields } = mergeSessionFields({ notes: '' }, { notes: 'x' });
    expect(unknownFields).toEqual([]);
  });
});
