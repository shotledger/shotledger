import { describe, expect, it } from 'vitest';

import {
  fixtureCsv,
  PLAIN_SERIES,
  type FixtureEntry,
  type FixtureSeries,
  type FixtureSession,
} from './fixtures';
import {
  applyBulkSuggestion,
  buildShotlogImportPlan,
  DATE_UNKNOWN_TAG,
  DNF_TAG,
  FINAL_TAG,
} from './plan';
import type { ShotlogExistingSession } from './types';

const FIREARMS = [
  { id: 'f1', label: 'Pistol One' },
  { id: 'f2', label: 'Revolver Two' },
];

/** One synthetic session; ids are unique per `n`, everything else invented. */
function entry(
  n: number,
  patch: Partial<FixtureSession> = {},
  series: readonly FixtureSeries[] = [PLAIN_SERIES],
): FixtureEntry {
  return {
    session: {
      id: `S-${n.toString(16).padStart(8, '0')}`,
      datetime: '2026-05-04 11:00:00',
      name: 'Club Cup C',
      ...patch,
    },
    series,
  };
}

function plan(entries: readonly FixtureEntry[], options = {}) {
  return buildShotlogImportPlan(fixtureCsv(entries), options);
}

function existing(patch: Partial<ShotlogExistingSession>): ShotlogExistingSession {
  return {
    id: 's1',
    name: 'Club Cup C',
    startedAt: '2026-05-04T09:00:00.000Z',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    externalSource: null,
    externalRef: null,
    ...patch,
  };
}

describe('buildShotlogImportPlan — whole-file failures', () => {
  it('reports an empty file as a single error and no rows', () => {
    const result = buildShotlogImportPlan('');
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ line: 1, message: 'empty' }]);
    expect(result.summary.errorCount).toBe(1);
    expect(result.summary.total).toBe(0);
  });

  it('reports a header mismatch as a single error', () => {
    expect(buildShotlogImportPlan('a,b,c').errors).toEqual([
      { line: 1, message: 'header-mismatch' },
    ]);
  });
});

describe('buildShotlogImportPlan — suggestions', () => {
  const cup = { tags: 'Precision|Tävling|Pistol One' };

  it('maps a competition session end to end', () => {
    const result = plan([entry(1, cup, [PLAIN_SERIES, { shots: ['(X)', '7'] }])], {
      knownFirearms: FIREARMS,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      status: 'new',
      selected: true,
      dateUncertain: false,
      ref: 'S-00000001',
      datetime: '2026-05-04T09:00:00.000Z',
      name: 'Club Cup C',
      warnings: [],
      duplicateOfLine: null,
    });
    expect(result.rows[0]!.suggestion).toEqual({
      sessionType: 'competition',
      disciplineId: 'spsf-precision',
      disciplineSource: 'tag',
      weaponGroup: 'spsf:C',
      weaponGroupSource: 'name',
      shooterClass: null,
      firearmId: 'f1',
      firearmLabel: null,
      competitionName: 'Club Cup C',
      tags: [],
      note: '',
      series: [
        {
          line: 2,
          position: 1,
          isSighter: false,
          shots: [
            { valueTenths: 100, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 90, isInnerTen: false },
            { valueTenths: 80, isInnerTen: false },
          ],
        },
        {
          line: 3,
          position: 2,
          isSighter: false,
          shots: [
            { valueTenths: 100, isInnerTen: true },
            { valueTenths: 70, isInnerTen: false },
          ],
        },
      ],
      dnf: false,
    });
  });

  it('leaves competitionName null for a training session', () => {
    const result = plan([entry(1, { tags: 'Precision' })]);
    expect(result.rows[0]!.suggestion.sessionType).toBe('training');
    expect(result.rows[0]!.suggestion.competitionName).toBeNull();
  });

  it('falls back to the name for the discipline when no tag says so', () => {
    const result = plan([entry(1, { name: 'MS2 A' })]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      disciplineId: 'spsf-milsnabb',
      disciplineSource: 'name',
      weaponGroup: 'spsf:A',
      weaponGroupSource: 'name',
    });
  });

  it('leaves the discipline unresolved when neither tag nor name says so', () => {
    const result = plan([entry(1, { name: 'Club night' })]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      disciplineId: null,
      disciplineSource: null,
      weaponGroup: null,
      weaponGroupSource: null,
      shooterClass: null,
    });
  });

  it('carries a class from a trailing group+class token', () => {
    const result = plan([entry(1, { ...cup, name: 'Club Cup C1' })]);
    expect(result.rows[0]!.suggestion).toMatchObject({ weaponGroup: 'spsf:C', shooterClass: '1' });
  });

  it('lets the A Opt tag win over the name token, without inventing a class', () => {
    const result = plan([entry(1, { name: 'Club Cup C1', tags: 'Precision|A Opt' })]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      weaponGroup: 'spsf:A-opt',
      weaponGroupSource: 'tag',
      shooterClass: null,
    });
  });

  it('records final and DNF as tags, and a sighter role as series 1 being a sighter', () => {
    // 'Club night' is mapped to `ignore` so it stays an ordinary tag; the
    // default role for an unrecognized tag is `firearm`, which is consumed.
    const result = plan(
      [entry(1, { tags: 'Precision|Warmup|Final|DNF|Club night' }, [PLAIN_SERIES, PLAIN_SERIES])],
      {
        tagMapping: {
          precision: { kind: 'discipline', disciplineId: 'spsf-precision' },
          warmup: { kind: 'sighter' },
          final: { kind: 'final' },
          dnf: { kind: 'dnf' },
          'club night': { kind: 'ignore' },
        },
      },
    );
    const { suggestion } = result.rows[0]!;
    expect(suggestion.tags).toEqual(['Club night', FINAL_TAG, DNF_TAG]);
    expect(suggestion.dnf).toBe(true);
    expect(suggestion.series.map((entry) => entry.isSighter)).toEqual([true, false]);
  });

  it('leaves the series alone without a sighter role', () => {
    const result = plan([entry(1, { tags: 'Precision' }, [PLAIN_SERIES, PLAIN_SERIES])]);
    expect(result.rows[0]!.suggestion.series.map((entry) => entry.isSighter)).toEqual([
      false,
      false,
    ]);
  });

  it('lets a Sighting=Yes series win over the sighter role', () => {
    const result = plan([
      entry(1, { tags: 'Precision|Warmup' }, [PLAIN_SERIES, { ...PLAIN_SERIES, sighting: 'Yes' }]),
    ]);
    expect(result.rows[0]!.suggestion.series.map((entry) => entry.isSighter)).toEqual([
      false,
      true,
    ]);
  });

  it('never alters the parsed session’s own series when applying the sighter role', () => {
    const text = fixtureCsv([entry(1, { tags: 'Precision|Warmup' })]);
    const first = buildShotlogImportPlan(text);
    const second = buildShotlogImportPlan(text, {
      tagMapping: { precision: { kind: 'discipline', disciplineId: 'spsf-precision' } },
    });
    expect(first.rows[0]!.suggestion.series[0]!.isSighter).toBe(true);
    expect(second.rows[0]!.suggestion.series[0]!.isSighter).toBe(false);
  });

  it('names a firearm the mapping found but the logbook does not have', () => {
    const result = plan([entry(1, { tags: 'Precision|Pistol Nine' })]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      firearmId: null,
      firearmLabel: 'Pistol Nine',
    });
  });

  it('keeps the CSV note above the generated lines, and the sighter out of the note', () => {
    const result = plan([entry(1, { note: 'windy', tags: 'Precision|Warmup|DNF' })]);
    expect(result.rows[0]!.suggestion.note).toBe('windy\nShotLog: did not finish');
  });

  it('propagates parse warnings onto the plan row', () => {
    const result = plan([entry(1, { tags: 'Precision' }, [{ ...PLAIN_SERIES, total: 1 }])]);
    expect(result.rows[0]!.warnings).toEqual(['series-total-mismatch']);
    expect(result.summary.warningCounts['series-total-mismatch']).toBe(1);
  });

  it('propagates classification warnings after the parse warnings', () => {
    const result = plan([
      entry(1, { tags: 'Precision|Milsnabb' }, [{ ...PLAIN_SERIES, total: 1 }]),
    ]);
    expect(result.rows[0]!.warnings).toEqual([
      'series-total-mismatch',
      'conflicting-discipline-tags',
    ]);
  });
});

describe('buildShotlogImportPlan — statuses', () => {
  const base = { tags: 'Precision' };

  it('marks a session with no series empty and leaves it unselected by default', () => {
    const result = plan([entry(1, base, [])]);
    expect(result.rows[0]!.status).toBe('empty');
    expect(result.rows[0]!.selected).toBe(false);
    expect(result.rows[0]!.matchedSessions).toEqual([]);
  });

  it('treats a series of misses as scored, not empty', () => {
    expect(plan([entry(1, base, [{ shots: ['0', '0'] }])]).rows[0]!.status).toBe('new');
  });

  it('selects empty sessions when includeEmpty is set', () => {
    const result = plan([entry(1, base, [])], { includeEmpty: true });
    expect(result.rows[0]!.selected).toBe(true);
  });

  it('marks an empty shadow as an in-file duplicate, before or after its twin', () => {
    const before = plan([entry(1, base, []), entry(2, base)]);
    expect(before.rows[0]).toMatchObject({
      status: 'duplicate-in-file',
      duplicateOfLine: 3,
      selected: false,
    });
    const after = plan([entry(1, base), entry(2, base, [])], { includeEmpty: true });
    expect(after.rows[1]).toMatchObject({
      status: 'duplicate-in-file',
      duplicateOfLine: 2,
      selected: false,
    });
  });

  it('keeps two sessions with series at the same instant and name, both new', () => {
    const result = plan([entry(1, base), entry(2, base)]);
    expect(result.rows.map((row) => row.status)).toEqual(['new', 'new']);
  });

  it('marks a session already imported as an exact duplicate', () => {
    const result = plan([entry(1, base)], {
      existingSessions: [existing({ externalSource: 'shotlog', externalRef: 'S-00000001' })],
    });
    expect(result.rows[0]).toMatchObject({ status: 'exact-duplicate', selected: false });
    expect(result.rows[0]!.matchedSessions).toEqual([{ id: 's1', name: 'Club Cup C' }]);
  });

  it('ranks "already imported" above "empty" so re-importing an empty session stays idempotent', () => {
    const result = plan([entry(1, base, [])], {
      existingSessions: [existing({ externalSource: 'shotlog', externalRef: 'S-00000001' })],
      includeEmpty: true,
    });
    expect(result.rows[0]).toMatchObject({ status: 'exact-duplicate', selected: false });
  });

  it('marks a same-day same-discipline same-group session as a probable duplicate', () => {
    const result = plan([entry(1, base)], {
      existingSessions: [
        existing({ id: 's2', name: 'Locally entered', startedAt: '2026-05-04T06:00:00Z' }),
      ],
    });
    expect(result.rows[0]).toMatchObject({ status: 'probable-duplicate', selected: false });
    expect(result.rows[0]!.matchedSessions).toEqual([{ id: 's2', name: 'Locally entered' }]);
  });

  it('shows an old totals-format import of the same session as a probable duplicate', () => {
    const result = plan([entry(1, base)], {
      existingSessions: [existing({ externalSource: 'shotlog', externalRef: '00000000deadbeef' })],
    });
    expect(result.rows[0]!.status).toBe('probable-duplicate');
  });

  it('does not look for probable duplicates once a session is an in-file duplicate', () => {
    const result = plan([entry(1, base), entry(2, base, [])], {
      existingSessions: [existing({ id: 's2', startedAt: '2026-05-04T06:00:00Z' })],
    });
    expect(result.rows[1]!.status).toBe('duplicate-in-file');
    expect(result.rows[1]!.matchedSessions).toEqual([]);
  });

  it('leaves a session new when nothing matches', () => {
    const result = plan([entry(1, base)], { existingSessions: [] });
    expect(result.rows[0]).toMatchObject({ status: 'new', selected: true, matchedSessions: [] });
  });
});

describe('buildShotlogImportPlan — lost dates', () => {
  const lost = '2019-01-01 01:00:00';
  const entries = [
    entry(1, { datetime: lost, name: 'Club Cup C', tags: 'Precision' }),
    entry(2, { datetime: lost, name: 'Spring Open C', tags: 'Precision' }),
    entry(3, { datetime: lost, name: 'Club night C', tags: 'Precision' }),
    entry(4, { name: 'Autumn Cup C', tags: 'Precision' }),
  ];

  it('flags every session in the shared-timestamp group and no other', () => {
    const result = plan(entries);
    expect(result.rows.map((r) => r.dateUncertain)).toEqual([true, true, true, false]);
    expect(result.summary.dateUncertainCount).toBe(3);
  });

  it('tags and annotates a date-uncertain session, keeping the timestamp', () => {
    const result = plan(entries);
    expect(result.rows[0]!.suggestion.tags).toContain(DATE_UNKNOWN_TAG);
    expect(result.rows[0]!.suggestion.note).toBe('ShotLog: date unknown (bulk import)');
    expect(result.rows[0]!.datetime).toBe('2019-01-01T00:00:00.000Z');
  });

  it('still imports date-uncertain sessions by default', () => {
    expect(plan(entries).rows[0]!.selected).toBe(true);
  });
});

describe('buildShotlogImportPlan — summary', () => {
  it('counts sessions by status, series, shots and row errors', () => {
    const text = `${fixtureCsv([
      entry(1, { tags: 'Precision' }, [PLAIN_SERIES, { shots: ['9', '9'] }]),
      entry(2, { tags: 'Precision' }, []),
      entry(3, { datetime: '2026-06-01 11:00:00', name: 'Spring Open C', tags: 'Precision' }, []),
    ])}\r\nbroken,row`;
    const result = buildShotlogImportPlan(text);
    expect(result.summary).toEqual({
      total: 3,
      seriesCount: 2,
      shotCount: 7,
      errorCount: 1,
      dateUncertainCount: 0,
      warningCounts: {},
      byStatus: {
        new: 1,
        empty: 1,
        'duplicate-in-file': 1,
        'exact-duplicate': 0,
        'probable-duplicate': 0,
      },
    });
    expect(result.errors[0]!.line).toBe(6);
  });

  it('counts each warning once per session that carries it', () => {
    const bad = { ...PLAIN_SERIES, total: 1 };
    const result = plan([entry(1, {}, [bad, bad]), entry(2, {}, [bad])]);
    expect(result.summary.warningCounts).toEqual({ 'series-total-mismatch': 2 });
  });
});

describe('applyBulkSuggestion', () => {
  const entries = [
    entry(1, { datetime: '2026-05-04 11:00:00', name: 'Club night' }),
    entry(2, { datetime: '2026-05-05 11:00:00', name: 'Club night' }),
    entry(3, { datetime: '2026-05-06 11:00:00', name: 'Spring Open C', tags: 'Precision' }),
  ];

  it('applies a patch to every row with the same discipline and group suggestion', () => {
    const result = applyBulkSuggestion(plan(entries).rows, 2, {
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:B',
      shooterClass: '2',
      firearmId: 'f1',
    });
    expect(result.slice(0, 2).map((r) => r.suggestion)).toEqual([
      expect.objectContaining({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:B' }),
      expect.objectContaining({ disciplineId: 'spsf-precision', weaponGroup: 'spsf:B' }),
    ]);
    expect(result[0]!.suggestion.shooterClass).toBe('2');
    expect(result[0]!.suggestion.firearmId).toBe('f1');
  });

  it('leaves dissimilar rows untouched', () => {
    const original = plan(entries).rows;
    const result = applyBulkSuggestion(original, 2, { disciplineId: 'spsf-precision' });
    expect(result[2]).toBe(original[2]);
  });

  it('requires BOTH the discipline and the weapon group to match', () => {
    // Source (line 2) suggests precision + spsf:C. Line 3 shares only the
    // discipline, line 4 only the group — neither may be patched.
    const mixed = [
      entry(1, { datetime: '2026-05-04 11:00:00', name: 'Spring Open C', tags: 'Precision' }),
      entry(2, { datetime: '2026-05-05 11:00:00', name: 'Spring Open A', tags: 'Precision' }),
      entry(3, { datetime: '2026-05-06 11:00:00', name: 'Spring Open C', tags: 'Milsnabb' }),
    ];
    const original = plan(mixed).rows;
    const result = applyBulkSuggestion(original, 2, { firearmId: 'f1' });
    expect(result[0]!.suggestion.firearmId).toBe('f1');
    expect(result[1]).toBe(original[1]);
    expect(result[2]).toBe(original[2]);
  });

  it('leaves the firearm alone when the patch does not name one', () => {
    const original = plan(entries).rows;
    const result = applyBulkSuggestion(original, 4, { shooterClass: '3' });
    expect(result[2]!.suggestion.firearmId).toBeNull();
    expect(result[2]!.suggestion.shooterClass).toBe('3');
  });

  it('leaves unspecified fields alone', () => {
    const original = plan(entries).rows;
    const result = applyBulkSuggestion(original, 4, { firearmId: 'f2' });
    expect(result[2]!.suggestion).toMatchObject({
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: null,
      firearmId: 'f2',
    });
  });

  it('accepts an explicit null to clear a field', () => {
    const original = plan(entries).rows;
    const result = applyBulkSuggestion(original, 4, { disciplineId: null, weaponGroup: null });
    expect(result[2]!.suggestion).toMatchObject({ disciplineId: null, weaponGroup: null });
  });

  it('returns a copy unchanged when the source line is not in the list', () => {
    const original = plan(entries).rows;
    const result = applyBulkSuggestion(original, 99, { firearmId: 'f1' });
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });
});
