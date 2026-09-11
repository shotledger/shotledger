import { describe, expect, it } from 'vitest';

import {
  bestMatch,
  collapseToFacilities,
  haversineMeters,
  matchRanges,
  type PositionFix,
} from './match';
import type { ShootingRange } from './overpass';

function range(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  isFacility = true,
): ShootingRange {
  return { id, name, latitude, longitude, isFacility };
}

// Malmö, near enough the maintainer's home range to keep the numbers readable.
const HERE: PositionFix = { latitude: 55.6, longitude: 13.0 };

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(HERE, HERE)).toBe(0);
  });

  it('matches a known distance', () => {
    // Cross-checked against the spherical law of cosines, an independent
    // formula, at 16.7071 km.
    const lund = { latitude: 55.7047, longitude: 13.191 };
    expect(haversineMeters(HERE, lund) / 1000).toBeCloseTo(16.707, 2);
  });

  it('is symmetric', () => {
    const other = { latitude: 55.61, longitude: 13.02 };
    expect(haversineMeters(HERE, other)).toBeCloseTo(haversineMeters(other, HERE), 6);
  });

  it('handles a degree of latitude, which is ~111 km anywhere', () => {
    const north = { latitude: 56.6, longitude: 13.0 };
    expect(haversineMeters(HERE, north) / 1000).toBeCloseTo(111.2, 0);
  });

  it('does not blow up on antipodes', () => {
    const antipode = { latitude: -55.6, longitude: -167 };
    expect(Number.isFinite(haversineMeters(HERE, antipode))).toBe(true);
  });
});

describe('matchRanges', () => {
  it('calls a range under the here-radius "here"', () => {
    const close = range('node/1', 'Banan', 55.6018, 13.0);
    const [match] = matchRanges(HERE, [close]);
    expect(match).toBeDefined();
    expect(match!.confidence).toBe('here');
    expect(match!.distanceMeters).toBeLessThan(500);
  });

  it('calls a range past the here-radius "nearby"', () => {
    const [match] = matchRanges(HERE, [range('node/1', 'Banan', 55.62, 13.0)]);
    expect(match!.confidence).toBe('nearby');
  });

  it('demotes a here-match when the fix is too vague to support it', () => {
    const close = range('node/1', 'Banan', 55.6018, 13.0);
    const vague = { ...HERE, accuracyMeters: 1500 };
    expect(matchRanges(vague, [close])[0]!.confidence).toBe('nearby');
    expect(matchRanges({ ...HERE, accuracyMeters: 10 }, [close])[0]!.confidence).toBe('here');
  });

  it('drops anything beyond the search radius', () => {
    const lund = range('node/1', 'Lund', 55.7047, 13.191);
    expect(matchRanges(HERE, [lund])).toEqual([]);
    expect(matchRanges(HERE, [lund], [], 25000)).toHaveLength(1);
  });

  it('orders closest first', () => {
    const far = range('node/2', 'Far', 55.61, 13.0);
    const near = range('node/1', 'Near', 55.601, 13.0);
    expect(matchRanges(HERE, [far, near]).map((m) => m.range.id)).toEqual(['node/1', 'node/2']);
  });

  it('breaks a distance tie on the label, so the list is stable', () => {
    const b = range('node/2', 'Beta', 55.601, 13.0);
    const a = range('node/1', 'Alfa', 55.601, 13.0);
    expect(matchRanges(HERE, [b, a]).map((m) => m.label)).toEqual(['Alfa', 'Beta']);
  });

  it('labels with the locality when OSM has one', () => {
    const withCity = { ...range('node/1', 'Banan', 55.601, 13.0), locality: 'Malmö' };
    expect(matchRanges(HERE, [withCity])[0]!.label).toBe('Banan, Malmö');
  });

  it("keeps the shooter's own spelling of a place they already log", () => {
    const osm = range('node/1', 'Malmö Skyttegille', 55.601, 13.0);
    const match = matchRanges(HERE, [osm], ['malmö skyttegille']);
    expect(match[0]!.label).toBe('malmö skyttegille');
  });

  it('does not rewrite a suggestion into a merely similar place', () => {
    const osm = range('node/1', 'Malmö Skyttegille', 55.601, 13.0);
    expect(matchRanges(HERE, [osm], ['Malmö Skyttegille B-banan'])[0]!.label).toBe(
      'Malmö Skyttegille',
    );
  });

  it('is empty when there are no ranges', () => {
    expect(matchRanges(HERE, [])).toEqual([]);
  });
});

describe('bestMatch', () => {
  it('is the single here-match', () => {
    const matches = matchRanges(HERE, [range('node/1', 'Banan', 55.6018, 13.0)]);
    expect(bestMatch(matches)?.range.id).toBe('node/1');
  });

  it('is null when the nearest range is merely nearby', () => {
    expect(bestMatch(matchRanges(HERE, [range('node/1', 'Banan', 55.62, 13.0)]))).toBeNull();
  });

  it('is null when two ranges share the site, rather than guessing between them', () => {
    const matches = matchRanges(HERE, [
      range('node/1', 'Klubb A', 55.6018, 13.0),
      range('node/2', 'Klubb B', 55.6019, 13.0),
    ]);
    expect(matches.every((m) => m.confidence === 'here')).toBe(true);
    expect(bestMatch(matches)).toBeNull();
  });

  it('is null for no matches at all', () => {
    expect(bestMatch([])).toBeNull();
  });
});

describe('collapseToFacilities', () => {
  // The real shape from Malmö Skyttegille: a club node with its lanes mapped
  // as separate features a few hundred metres away.
  const club = range('node/1', 'Malmö Skyttegille', 55.6317, 13.0509);
  const lane = range('way/2', 'A1 - 200 meter', 55.6338, 13.0488, false);
  const otherLane = range('way/3', 'Älgen', 55.6345, 13.0494, false);

  it("drops a club's own lanes", () => {
    expect(collapseToFacilities([club, lane, otherLane])).toEqual([club]);
  });

  it('keeps a standalone range that is merely tagged as a pitch', () => {
    // Lomma skytteförening is leisure=pitch and is nonetheless the club.
    const lomma = range('node/4', 'Lomma skytteförening', 55.6505, 13.0557, false);
    expect(collapseToFacilities([club, lomma]).map((r) => r.id)).toEqual(['node/1', 'node/4']);
  });

  it('keeps everything when no facility is in the list at all', () => {
    expect(collapseToFacilities([lane, otherLane])).toHaveLength(2);
  });

  it('keeps two clubs sharing a site', () => {
    const neighbour = range('node/5', 'Malmö Jaktskyttecenter', 55.6318, 13.0509);
    expect(collapseToFacilities([club, neighbour])).toHaveLength(2);
  });

  it('is empty for an empty list', () => {
    expect(collapseToFacilities([])).toEqual([]);
  });
});

describe('matchRanges, on real OSM shapes', () => {
  it('offers the club, not its eleven lanes', () => {
    const fix = { latitude: 55.6317, longitude: 13.0509, accuracyMeters: 20 };
    const matches = matchRanges(fix, [
      range('node/1', 'Malmö Skyttegille', 55.6317, 13.0509),
      range('way/2', 'A1 - 200 meter', 55.6338, 13.0488, false),
      range('way/3', 'C - 50 meter', 55.6324, 13.0498, false),
      range('way/4', 'Älgen', 55.6345, 13.0494, false),
    ]);
    expect(matches.map((m) => m.label)).toEqual(['Malmö Skyttegille']);
    expect(bestMatch(matches)?.confidence).toBe('here');
  });
});
