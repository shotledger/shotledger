import { describe, expect, it } from 'vitest';
import { fixtureResultRow, fixtureStationResult } from './api/fixtures';
import {
  mapClassname,
  mapOfficialResult,
  mapResultsType,
  mapStationResultsToFaltStations,
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
          `Unrecognized Webshooter classname "${classname}" — needs a manual mapping`,
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
      faltResultMode: null,
    });
  });

  it('maps military to spsf-milsnabb', () => {
    expect(mapResultsType('military')).toEqual({
      disciplineId: 'spsf-milsnabb',
      programId: 'spsf-milsnabb',
      faltResultMode: null,
    });
  });

  it('maps field to spsf-falt in vanlig fält mode, with no program', () => {
    expect(mapResultsType('field')).toEqual({
      disciplineId: 'spsf-falt',
      programId: null,
      faltResultMode: 'falt',
    });
  });

  it('maps pointfield to spsf-falt in poängfält mode, with no program', () => {
    expect(mapResultsType('pointfield')).toEqual({
      disciplineId: 'spsf-falt',
      programId: null,
      faltResultMode: 'poangfalt',
    });
  });

  it('returns null when Webshooter reports no results type', () => {
    expect(mapResultsType(null)).toBeNull();
  });
});

describe('mapStationResultsToFaltStations', () => {
  const station = (
    stationsId: number,
    hits: number | null,
    figureHits: number | null,
    points = 0,
  ) =>
    fixtureStationResult({
      id: stationsId,
      stations_id: stationsId,
      hits,
      figure_hits: figureHits,
      points,
    });

  it('maps each station row to one station, in stations_id order, numbered from 1', () => {
    const row = fixtureResultRow({
      results: [station(12, 4, 2), station(10, 6, 3), station(11, 0, 0)],
      results_finals: [],
      results_distinguish: [],
    });

    expect(mapStationResultsToFaltStations(row)).toEqual({
      ok: true,
      stations: [
        { position: 1, hits: 6, figuresHit: 3, points: null, isShootOff: false },
        { position: 2, hits: 0, figuresHit: 0, points: null, isShootOff: false },
        { position: 3, hits: 4, figuresHit: 2, points: null, isShootOff: false },
      ],
    });
  });

  it("keeps a poängmål's ring points and reads 0 as no poängmål", () => {
    const row = fixtureResultRow({
      results: [station(1, 5, 3, 0), station(2, 6, 4, 27)],
      results_finals: [],
      results_distinguish: [],
    });

    const result = mapStationResultsToFaltStations(row);

    expect(result.ok && result.stations.map((s) => s.points)).toEqual([null, 27]);
  });

  it('numbers shoot-off stations on after the round and flags them', () => {
    const row = fixtureResultRow({
      results: [station(1, 6, 3), station(2, 5, 3)],
      results_finals: [],
      results_distinguish: [station(90, 4, 2)],
    });

    const result = mapStationResultsToFaltStations(row);

    expect(result.ok && result.stations.map((s) => [s.position, s.isShootOff])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });

  it('skips a station that was not shot, and a deleted one, closing up the numbering', () => {
    const row = fixtureResultRow({
      results: [
        station(1, 6, 3),
        station(2, null, null),
        fixtureStationResult({ id: 3, stations_id: 3, hits: 2, figure_hits: 1, deleted_at: 'x' }),
        station(4, 3, 2),
      ],
      results_finals: [],
      results_distinguish: [],
    });

    const result = mapStationResultsToFaltStations(row);

    expect(result.ok && result.stations.map((s) => [s.position, s.hits])).toEqual([
      [1, 6],
      [2, 3],
    ]);
  });

  it('accepts a station with no hits and no figure count', () => {
    const row = fixtureResultRow({
      results: [station(1, 0, null)],
      results_finals: [],
      results_distinguish: [],
    });

    expect(mapStationResultsToFaltStations(row)).toEqual({
      ok: true,
      stations: [{ position: 1, hits: 0, figuresHit: 0, points: null, isShootOff: false }],
    });
  });

  it.each([
    ['hits above six', station(1, 7, 3), 'station 1: hits 7 is outside 0-6'],
    ['negative hits', station(1, -1, 0), 'station 1: hits -1 is outside 0-6'],
    ['more figures than hits', station(1, 2, 3), 'station 1: figure_hits 3 with 2 hits'],
    ['hits on no figure', station(1, 4, 0), 'station 1: 4 hits spread over 0 figures'],
    ['hits with no figure count', station(1, 4, null), 'station 1: 4 hits but no figure count'],
    ['negative points', station(1, 4, 2, -3), 'station 1: points -3'],
  ])('fails soft on %s rather than correcting it', (_label, bad, reason) => {
    const row = fixtureResultRow({
      results: [bad],
      results_finals: [],
      results_distinguish: [],
    });

    expect(mapStationResultsToFaltStations(row)).toEqual({ ok: false, reason });
  });

  it('names the station by its position among the shot ones', () => {
    const row = fixtureResultRow({
      results: [station(1, 6, 3), station(2, null, null), station(3, 9, 3)],
      results_finals: [],
      results_distinguish: [],
    });

    expect(mapStationResultsToFaltStations(row)).toEqual({
      ok: false,
      reason: 'station 2: hits 9 is outside 0-6',
    });
  });
});

describe('mapStationResultsToSeries', () => {
  it('maps main-round rows to non-final overrides with sequential positions', () => {
    const row = fixtureResultRow();
    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(7);
    expect(mapped.every((s) => s.isFinal === false && s.isTotalOverride)).toBe(true);
    expect(mapped.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(mapped[0]!.totalOverrideTenths).toBe(row.results[0]!.points! * 10);
    expect(mapped[0]!.totalOverrideShotCount).toBe(5);
  });

  it('skips a station that was never shot rather than importing it as zero', () => {
    // Real Webshooter data has null points on unshot stations. `null * 10`
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

  it('maps results_finals to isFinal true, not a shoot-off, positions continuing after the main round', () => {
    const row = fixtureResultRow({
      results: [fixtureStationResult({ stations_id: 1, points: 40 })],
      results_finals: [fixtureStationResult({ id: 999, finals: 1, stations_id: 1, points: 48 })],
    });
    const mapped = mapStationResultsToSeries(row, 5);

    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toMatchObject({
      position: 2,
      isFinal: true,
      totalOverrideTenths: 480,
    });
  });

  it('skips results_distinguish: a precision särskjutning is not imported (#727)', () => {
    const row = fixtureResultRow({
      results: [fixtureStationResult({ stations_id: 1, points: 40 })],
      results_finals: [fixtureStationResult({ id: 999, finals: 1, stations_id: 1, points: 48 })],
      results_distinguish: [
        fixtureStationResult({ id: 998, distinguish: 1, stations_id: 1, points: 49 }),
      ],
    });
    expect(mapStationResultsToSeries(row, 5).map((s) => s.totalOverrideTenths)).toEqual([400, 480]);
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
      officialStandardMedal: 'none',
    });
  });

  it('maps std_medal B to brons', () => {
    const row = fixtureResultRow({ placement: 3, std_medal: 'B' });
    expect(mapOfficialResult(row)).toEqual({
      officialPlacement: 3,
      officialStandardMedal: 'brons',
    });
  });

  it('maps std_medal S to silver', () => {
    const row = fixtureResultRow({ placement: 1, std_medal: 'S' });
    expect(mapOfficialResult(row)).toEqual({
      officialPlacement: 1,
      officialStandardMedal: 'silver',
    });
  });
});
