import { describe, expect, it } from 'vitest';
import { fixtureResultRow, fixtureStationResult } from './api/fixtures';
import {
  localToUtcIso,
  mapClassname,
  mapOfficialResult,
  mapResultsType,
  mapStationResultsToSeries,
} from './mapping';

describe('mapClassname', () => {
  it.each([
    ['C2', { ok: true, weaponGroup: 'spsf:C', shooterClass: '2' }],
    ['A3', { ok: true, weaponGroup: 'spsf:A', shooterClass: '3' }],
    ['B1', { ok: true, weaponGroup: 'spsf:B', shooterClass: '1' }],
    ['R2', { ok: true, weaponGroup: 'spsf:R', shooterClass: '2' }],
    ['CD2', { ok: true, weaponGroup: 'spsf:C', shooterClass: 'Dam2' }],
    ['CJun', { ok: true, weaponGroup: 'spsf:C', shooterClass: 'Jun' }],
    ['CVÄ', { ok: true, weaponGroup: 'spsf:C', shooterClass: 'VetÄ' }],
    ['CVY', { ok: true, weaponGroup: 'spsf:C', shooterClass: 'VetY' }],
    ['A Opt 1', { ok: true, weaponGroup: 'spsf:A-opt', shooterClass: '1' }],
  ])('mapClassname(%p)', (classname, expected) => {
    expect(mapClassname(classname)).toEqual(expected);
  });

  it.each([['A'], ['B'], ['AG'], ['AP'], ['AM'], ['OptR'], ['M2'], ['bogus'], ['']])(
    'fails soft (never guesses) for %p',
    (classname) => {
      const result = mapClassname(classname);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ classname });
      if (!result.ok) {
        expect(result.reason).toBe(
          `Unrecognized WebShooter classname "${classname}" — needs a manual mapping`,
        );
      }
    },
  );
});

describe('mapResultsType', () => {
  it('maps precision to spsf-precision', () => {
    expect(mapResultsType('precision')).toEqual({
      disciplineId: 'spsf-precision',
      programId: 'spsf-precision',
    });
  });

  it('maps military to spsf-milsnabb', () => {
    expect(mapResultsType('military')).toEqual({
      disciplineId: 'spsf-milsnabb',
      programId: 'spsf-milsnabb',
    });
  });

  it.each([['field'], ['pointfield'], [null]])('returns null for out-of-scope type %p', (type) => {
    expect(mapResultsType(type as never)).toBeNull();
  });
});

describe('mapStationResultsToSeries', () => {
  it('maps main-round rows to non-final, no-note overrides with sequential positions', () => {
    const row = fixtureResultRow();
    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(7);
    expect(mapped.every((s) => s.isFinal === false && s.note === null && s.isTotalOverride)).toBe(
      true,
    );
    expect(mapped.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(mapped[0]!.totalOverrideTenths).toBe(row.results[0]!.points! * 10);
    expect(mapped[0]!.totalOverrideShotCount).toBe(5);
  });

  it('skips a station that was never shot rather than importing it as zero', () => {
    // Real WebShooter data has null points on unshot stations. `null * 10`
    // is 0 in JavaScript, so the naive mapping invents a zero-scored series
    // — worse than dropping it, because it silently lowers every average.
    const row = fixtureResultRow({
      results: [
        fixtureStationResult({ stations_id: 1, points: 40 }),
        fixtureStationResult({ id: 2, stations_id: 2, points: null }),
        fixtureStationResult({ id: 3, stations_id: 3, points: 44 }),
      ],
      results_finals: [],
      results_distinguish: [],
    });

    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(2);
    expect(mapped.map((s) => s.totalOverrideTenths)).toEqual([400, 440]);
    // Positions close up: the gap must not leave a hole in the numbering.
    expect(mapped.map((s) => s.position)).toEqual([1, 2]);
  });

  it('maps results_finals to isFinal true, no note, positions continuing after the main round', () => {
    const row = fixtureResultRow({
      results: [fixtureStationResult({ stations_id: 1, points: 40 })],
      results_finals: [fixtureStationResult({ id: 999, finals: 1, stations_id: 1, points: 48 })],
    });
    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toMatchObject({
      position: 2,
      isFinal: true,
      note: null,
      totalOverrideTenths: 480,
    });
  });

  it('maps results_distinguish to isFinal false with a särskjutning note (ordinary extra series, not a special flag)', () => {
    const row = fixtureResultRow({
      results: [fixtureStationResult({ stations_id: 1, points: 40 })],
      results_distinguish: [
        fixtureStationResult({ id: 998, distinguish: 1, stations_id: 1, points: 49 }),
      ],
    });
    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toMatchObject({
      position: 2,
      isFinal: false,
      note: 'särskjutning',
      totalOverrideTenths: 490,
    });
  });

  it('returns [] when a result row has no station results at all', () => {
    const row = fixtureResultRow({ results: [], results_finals: [], results_distinguish: [] });
    expect(mapStationResultsToSeries(row, 5)).toEqual([]);
  });
});

describe('mapOfficialResult', () => {
  it('maps std_medal null to none', () => {
    const row = fixtureResultRow({ placement: 5, std_medal: null });
    expect(mapOfficialResult(row)).toEqual({
      officialPlacement: 5,
      officialStandardmedalj: 'none',
    });
  });

  it('maps std_medal B to brons', () => {
    const row = fixtureResultRow({ placement: 3, std_medal: 'B' });
    expect(mapOfficialResult(row)).toEqual({
      officialPlacement: 3,
      officialStandardmedalj: 'brons',
    });
  });

  it('maps std_medal S to silver', () => {
    const row = fixtureResultRow({ placement: 1, std_medal: 'S' });
    expect(mapOfficialResult(row)).toEqual({
      officialPlacement: 1,
      officialStandardmedalj: 'silver',
    });
  });
});

describe('localToUtcIso', () => {
  it('converts a summer (CEST, UTC+2) timestamp', () => {
    expect(localToUtcIso('2026-06-13 09:00:00')).toBe('2026-06-13T07:00:00.000Z');
  });

  it('converts a winter (CET, UTC+1) timestamp', () => {
    expect(localToUtcIso('2026-01-15 09:00:00')).toBe('2026-01-15T08:00:00.000Z');
  });

  it('converts a timestamp just before the 2026 spring-forward transition (CET, UTC+1)', () => {
    expect(localToUtcIso('2026-03-28 12:00:00')).toBe('2026-03-28T11:00:00.000Z');
  });

  it('converts a timestamp just after the 2026 spring-forward transition (CEST, UTC+2)', () => {
    expect(localToUtcIso('2026-03-30 12:00:00')).toBe('2026-03-30T10:00:00.000Z');
  });

  it('converts a timestamp just before the 2026 fall-back transition (CEST, UTC+2)', () => {
    expect(localToUtcIso('2026-10-24 12:00:00')).toBe('2026-10-24T10:00:00.000Z');
  });

  it('converts a timestamp just after the 2026 fall-back transition (CET, UTC+1)', () => {
    expect(localToUtcIso('2026-10-26 12:00:00')).toBe('2026-10-26T11:00:00.000Z');
  });

  it('throws on a malformed local timestamp, with the offending value in the message', () => {
    expect(() => localToUtcIso('not-a-timestamp')).toThrow(
      'Expected "YYYY-MM-DD HH:mm:ss", got "not-a-timestamp"',
    );
  });

  it('throws when the string has a valid timestamp with a garbage prefix (anchored match, not "found anywhere")', () => {
    expect(() => localToUtcIso('xx2026-06-13 09:00:00')).toThrow(RangeError);
  });

  it('throws when the string has a valid timestamp with a garbage suffix (anchored match, not "found anywhere")', () => {
    expect(() => localToUtcIso('2026-06-13 09:00:00xx')).toThrow(RangeError);
  });
});
