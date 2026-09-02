import { describe, expect, it } from 'vitest';

import { fixtureCsv, type FixtureRow } from './fixtures';
import {
  applyBulkSuggestion,
  buildShotlogImportPlan,
  DATE_UNKNOWN_TAG,
  DNF_TAG,
  FINAL_TAG,
  WARMUP_TAG,
} from './plan';
import { buildShotlogRef } from './ref';
import type { ShotlogExistingSession } from './types';

const FIREARMS = [
  { id: 'f1', label: 'Pistol One' },
  { id: 'f2', label: 'Revolver Two' },
];

function plan(rows: readonly FixtureRow[], options = {}) {
  return buildShotlogImportPlan(fixtureCsv(rows), options);
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
  const row: FixtureRow = {
    datetime: '2026-05-04T09:00:00Z',
    name: 'Club Cup C',
    total: 312,
    tens: 8,
    innerTens: 3,
    tags: 'Precision|Tävling|Pistol One',
  };

  it('maps a competition row end to end', () => {
    const result = plan([row], { knownFirearms: FIREARMS });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      status: 'new',
      selected: true,
      dateUncertain: false,
      ref: buildShotlogRef({ datetime: row.datetime, name: 'Club Cup C', totalScore: 312 }),
    });
    expect(result.rows[0]!.suggestion).toEqual({
      sessionType: 'competition',
      disciplineId: 'spsf-precision',
      disciplineSource: 'tag',
      weaponGroup: 'spsf:C',
      weaponGroupSource: 'name',
      shooterClass: null,
      firearmId: 'f1',
      competitionName: 'Club Cup C',
      tags: [],
      note: 'ShotLog: X=8, (X)=3',
      totalTenths: 3120,
      innerTenCount: 3,
      tenCount: 8,
    });
  });

  it('leaves competitionName null for a training session', () => {
    const result = plan([{ ...row, tags: 'Precision' }]);
    expect(result.rows[0]!.suggestion.sessionType).toBe('training');
    expect(result.rows[0]!.suggestion.competitionName).toBeNull();
  });

  it('falls back to the name for the discipline when no tag says so', () => {
    const result = plan([{ ...row, name: 'MS2 A', tags: '' }]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      disciplineId: 'spsf-milsnabb',
      disciplineSource: 'name',
      weaponGroup: 'spsf:A',
      weaponGroupSource: 'name',
    });
  });

  it('leaves the discipline unresolved when neither tag nor name says so', () => {
    const result = plan([{ ...row, name: 'Club night', tags: '' }]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      disciplineId: null,
      disciplineSource: null,
      weaponGroup: null,
      weaponGroupSource: null,
      shooterClass: null,
    });
  });

  it('carries a class from a trailing group+class token', () => {
    const result = plan([{ ...row, name: 'Club Cup C1' }]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      weaponGroup: 'spsf:C',
      shooterClass: '1',
    });
  });

  it('lets the A Opt tag win over the name token, without inventing a class', () => {
    const result = plan([{ ...row, name: 'Club Cup C1', tags: 'Precision|A Opt' }]);
    expect(result.rows[0]!.suggestion).toMatchObject({
      weaponGroup: 'spsf:A-opt',
      weaponGroupSource: 'tag',
      shooterClass: null,
    });
  });

  it('records Warmup / Final / DNF as tags and never alters the total', () => {
    const result = plan([{ ...row, tags: 'Precision|Warmup|Final|DNF|Club night' }]);
    expect(result.rows[0]!.suggestion.tags).toEqual(['Club night', WARMUP_TAG, FINAL_TAG, DNF_TAG]);
    expect(result.rows[0]!.suggestion.totalTenths).toBe(3120);
  });

  it('keeps the CSV note above the generated lines', () => {
    const result = plan([{ ...row, note: 'windy' }]);
    expect(result.rows[0]!.suggestion.note).toBe('windy\nShotLog: X=8, (X)=3');
  });

  it('propagates parse warnings onto the plan row', () => {
    const result = plan([{ ...row, tens: 1, innerTens: 5 }]);
    expect(result.rows[0]!.warnings).toContain('inner-ten-exceeds-ten-count');
    expect(result.summary.warningCounts['inner-ten-exceeds-ten-count']).toBe(1);
  });

  it('propagates classification warnings onto the plan row', () => {
    const result = plan([{ ...row, tags: 'Precision|Milsnabb' }]);
    expect(result.rows[0]!.warnings).toContain('conflicting-discipline-tags');
  });
});

describe('buildShotlogImportPlan — statuses', () => {
  const base: FixtureRow = {
    datetime: '2026-05-04T09:00:00Z',
    name: 'Club Cup C',
    total: 312,
    tags: 'Precision',
  };

  it('marks a zero-total row empty and leaves it unselected by default', () => {
    const result = plan([{ ...base, total: 0 }]);
    expect(result.rows[0]!.status).toBe('empty');
    expect(result.rows[0]!.selected).toBe(false);
    expect(result.rows[0]!.matchedSessions).toEqual([]);
  });

  it('selects empty rows when includeEmpty is set', () => {
    const result = plan([{ ...base, total: 0 }], { includeEmpty: true });
    expect(result.rows[0]!.selected).toBe(true);
  });

  it('marks an in-file duplicate and never selects it', () => {
    const result = plan([base, base]);
    expect(result.rows[1]).toMatchObject({
      status: 'duplicate-in-file',
      duplicateOfLine: 2,
      selected: false,
    });
  });

  it('prefers duplicate-in-file over empty for a zero-total shadow row', () => {
    const result = plan([base, { ...base, total: 0 }]);
    expect(result.rows[1]!.status).toBe('duplicate-in-file');
  });

  it('marks a row already imported as an exact duplicate', () => {
    const ref = buildShotlogRef({ datetime: base.datetime, name: 'Club Cup C', totalScore: 312 });
    const existing: ShotlogExistingSession[] = [
      {
        id: 's1',
        name: 'Club Cup C',
        startedAt: base.datetime,
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        externalRef: ref,
      },
    ];
    const result = plan([base], { existingSessions: existing });
    expect(result.rows[0]).toMatchObject({ status: 'exact-duplicate', selected: false });
    expect(result.rows[0]!.matchedSessions).toEqual([{ id: 's1', name: 'Club Cup C' }]);
  });

  it('ranks "already imported" above "empty" so a zero-score re-import stays idempotent', () => {
    const empty = { ...base, total: 0 };
    const ref = buildShotlogRef({ datetime: base.datetime, name: 'Club Cup C', totalScore: 0 });
    const existing: ShotlogExistingSession[] = [
      {
        id: 's1',
        name: 'Club Cup C',
        startedAt: base.datetime,
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        externalRef: ref,
      },
    ];
    const result = plan([empty], { existingSessions: existing, includeEmpty: true });
    expect(result.rows[0]).toMatchObject({ status: 'exact-duplicate', selected: false });
  });

  it('marks a same-day same-discipline same-group session as a probable duplicate', () => {
    const existing: ShotlogExistingSession[] = [
      {
        id: 's2',
        name: 'Locally entered',
        startedAt: '2026-05-04T06:00:00Z',
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        externalRef: null,
      },
    ];
    const result = plan([base], { existingSessions: existing });
    expect(result.rows[0]).toMatchObject({ status: 'probable-duplicate', selected: false });
    expect(result.rows[0]!.matchedSessions).toEqual([{ id: 's2', name: 'Locally entered' }]);
  });

  it('does not look for probable duplicates once a row is an in-file duplicate', () => {
    const existing: ShotlogExistingSession[] = [
      {
        id: 's2',
        name: 'Locally entered',
        startedAt: '2026-05-04T06:00:00Z',
        disciplineId: 'spsf-precision',
        weaponGroup: 'spsf:C',
        externalRef: null,
      },
    ];
    const result = plan([base, base], { existingSessions: existing });
    expect(result.rows[1]!.status).toBe('duplicate-in-file');
    expect(result.rows[1]!.matchedSessions).toEqual([]);
  });

  it('leaves a row new when nothing matches', () => {
    const result = plan([base], { existingSessions: [] });
    expect(result.rows[0]).toMatchObject({ status: 'new', selected: true, matchedSessions: [] });
  });
});

describe('buildShotlogImportPlan — lost dates', () => {
  const lost = '2019-01-01T00:00:00Z';
  const rows: FixtureRow[] = [
    { datetime: lost, name: 'Club Cup C', total: 300, tags: 'Precision' },
    { datetime: lost, name: 'Spring Open C', total: 310, tags: 'Precision' },
    { datetime: lost, name: 'Club night C', total: 320, tags: 'Precision' },
    { datetime: '2026-05-04T09:00:00Z', name: 'Autumn Cup C', total: 330, tags: 'Precision' },
  ];

  it('flags every row in the shared-timestamp group and no other', () => {
    const result = plan(rows);
    expect(result.rows.map((r) => r.dateUncertain)).toEqual([true, true, true, false]);
    expect(result.summary.dateUncertainCount).toBe(3);
  });

  it('tags and annotates a date-uncertain row, keeping the timestamp', () => {
    const result = plan(rows);
    expect(result.rows[0]!.suggestion.tags).toContain(DATE_UNKNOWN_TAG);
    expect(result.rows[0]!.suggestion.note).toContain('date unknown');
    expect(result.rows[0]!.datetime).toBe(lost);
  });

  it('still imports date-uncertain rows by default', () => {
    expect(plan(rows).rows[0]!.selected).toBe(true);
  });
});

describe('buildShotlogImportPlan — summary', () => {
  it('counts rows by status and reports row errors', () => {
    const good: FixtureRow = {
      datetime: '2026-05-04T09:00:00Z',
      name: 'Club Cup C',
      total: 312,
      tags: 'Precision',
    };
    const text = `${fixtureCsv([
      good,
      good,
      { ...good, datetime: '2026-06-01T09:00:00Z', name: 'Spring Open C', total: 0 },
    ])}\r\nbroken,row`;
    const result = buildShotlogImportPlan(text);
    expect(result.summary).toMatchObject({
      total: 3,
      errorCount: 1,
      dateUncertainCount: 0,
      byStatus: {
        new: 1,
        empty: 1,
        'duplicate-in-file': 1,
        'exact-duplicate': 0,
        'probable-duplicate': 0,
      },
    });
    expect(result.errors[0]!.line).toBe(5);
  });
});

describe('applyBulkSuggestion', () => {
  const rows: FixtureRow[] = [
    { datetime: '2026-05-04T09:00:00Z', name: 'Club night', total: 300 },
    { datetime: '2026-05-05T09:00:00Z', name: 'Club night', total: 301 },
    { datetime: '2026-05-06T09:00:00Z', name: 'Spring Open C', total: 302, tags: 'Precision' },
  ];

  it('applies a patch to every row with the same discipline and group suggestion', () => {
    const result = applyBulkSuggestion(plan(rows).rows, 2, {
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
    const original = plan(rows).rows;
    const result = applyBulkSuggestion(original, 2, { disciplineId: 'spsf-precision' });
    expect(result[2]).toBe(original[2]);
  });

  it('requires BOTH the discipline and the weapon group to match', () => {
    // Source (line 4) suggests precision + spsf:C. Line 5 shares only the
    // discipline, line 6 only the group — neither may be patched.
    const mixed: FixtureRow[] = [
      { datetime: '2026-05-04T09:00:00Z', name: 'Spring Open C', total: 300, tags: 'Precision' },
      { datetime: '2026-05-05T09:00:00Z', name: 'Spring Open A', total: 301, tags: 'Precision' },
      { datetime: '2026-05-06T09:00:00Z', name: 'Spring Open C', total: 302, tags: 'Milsnabb' },
    ];
    const original = plan(mixed).rows;
    const result = applyBulkSuggestion(original, 2, { firearmId: 'f1' });
    expect(result[0]!.suggestion.firearmId).toBe('f1');
    expect(result[1]).toBe(original[1]);
    expect(result[2]).toBe(original[2]);
  });

  it('leaves the firearm alone when the patch does not name one', () => {
    const original = plan(rows).rows;
    const result = applyBulkSuggestion(original, 4, { shooterClass: '3' });
    expect(result[2]!.suggestion.firearmId).toBeNull();
    expect(result[2]!.suggestion.shooterClass).toBe('3');
  });

  it('leaves unspecified fields alone', () => {
    const original = plan(rows).rows;
    const result = applyBulkSuggestion(original, 4, { firearmId: 'f2' });
    expect(result[2]!.suggestion).toMatchObject({
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: null,
      firearmId: 'f2',
    });
  });

  it('accepts an explicit null to clear a field', () => {
    const original = plan(rows).rows;
    const result = applyBulkSuggestion(original, 4, { disciplineId: null, weaponGroup: null });
    expect(result[2]!.suggestion).toMatchObject({ disciplineId: null, weaponGroup: null });
  });

  it('returns a copy unchanged when the source line is not in the list', () => {
    const original = plan(rows).rows;
    const result = applyBulkSuggestion(original, 99, { firearmId: 'f1' });
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });
});
