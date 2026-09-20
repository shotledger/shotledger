// Turning a GPS fix plus a list of OSM ranges into "you are at Malmö
// Skyttegille" — or, honestly, into nothing at all.
//
// The thing this must not do is fill the Location field with a confident wrong
// answer. A wrong range is worse than an empty field: the shooter would have
// to notice it before it lands in a session that a föreningsintyg is later
// drawn from. So the match is offered, never applied, and anything that is not
// clearly the range you are standing on is offered as one candidate among
// several.

import { formatRange, type ShootingRange } from './overpass';

/** A position fix. `accuracyMeters` is the radius the device is confident in. */
export interface PositionFix {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

/**
 * How sure we are, which is what the UI renders differently:
 * - `here` — the fix, widened by its own error, sits inside the range.
 * - `nearby` — within the search radius, but not provably at it.
 */
export type MatchConfidence = 'here' | 'nearby';

export interface RangeMatch {
  range: ShootingRange;
  /** Great-circle meters from the fix to the range's OSM point. */
  distanceMeters: number;
  confidence: MatchConfidence;
  /** What to put in the Location field. */
  label: string;
}

/**
 * A range's OSM point is a centroid, not a fence, and a 300 m bana tagged as a
 * single node puts the shooter a long way from it while standing on it. 500 m
 * is chosen to cover that rather than to express GPS precision.
 */
export const HERE_RADIUS_METERS = 500;

/** How far out we bother looking at all. */
export const SEARCH_RADIUS_METERS = 5000;

/**
 * How close a lane has to be to a club site to count as part of it. Malmö
 * Skyttegille's lanes span roughly 250 m end to end from the club node, which
 * is what this is sized against.
 */
export const FACILITY_EXTENT_METERS = 500;

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function haversineMeters(a: PositionFix, b: PositionFix): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Drops the individual firing lanes of a club whose site is itself in the list.
 *
 * Surveyed Swedish ranges map the club as `leisure=sports_center` and each
 * lane as a separate `leisure=pitch`/`range` inside it. Offering those raw
 * would bury "Malmö Skyttegille" under "A1 - 200 meter", "B3 - 75 neter" and
 * "Älgen" — none of which is a place a shooter would write in a logbook.
 *
 * A non-facility is kept when it is nowhere near a facility: "Lomma
 * skytteförening" is tagged `leisure=pitch` and is nonetheless the whole club,
 * and dropping it because of its tagging would lose a real range. Tag quality
 * varies too much to do better than proximity here.
 */
export function collapseToFacilities(
  ranges: readonly ShootingRange[],
  extentMeters = FACILITY_EXTENT_METERS,
): ShootingRange[] {
  const facilities = ranges.filter((range) => range.isFacility);
  if (facilities.length === 0) return [...ranges];

  return ranges.filter(
    (range) =>
      range.isFacility ||
      !facilities.some((facility) => haversineMeters(facility, range) <= extentMeters),
  );
}

/**
 * Keeps the shooter's own spelling of a place they have already logged.
 *
 * OSM says "Malmö Skyttegille"; the shooter has been typing "MSG Kastrup" for
 * two years and their session list groups on that string. Matching
 * case-insensitively on the exact name only — not a fuzzy match — because
 * silently rewriting a suggestion into a different place is the failure this
 * whole module is trying to avoid.
 */
function preferKnownSpelling(label: string, knownLocations: readonly string[]): string {
  const needle = label.toLocaleLowerCase();
  return knownLocations.find((known) => known.toLocaleLowerCase() === needle) ?? label;
}

/**
 * Ranges near `fix`, closest first, with anything beyond the search radius
 * dropped.
 *
 * `knownLocations` are the shooter's own previous location strings; a match
 * keeps their spelling. Ties break on name so the list never reorders itself
 * between two ranges at the same distance.
 */
export function matchRanges(
  fix: PositionFix,
  ranges: readonly ShootingRange[],
  knownLocations: readonly string[] = [],
  searchRadiusMeters = SEARCH_RADIUS_METERS,
): RangeMatch[] {
  const matches: RangeMatch[] = [];

  for (const range of collapseToFacilities(ranges)) {
    const distanceMeters = haversineMeters(fix, range);
    if (distanceMeters > searchRadiusMeters) continue;

    // Widen by the fix's own error before claiming to be at the range: a
    // 2 km fix 100 m from a range proves nothing about where the shooter is.
    const uncertainty = fix.accuracyMeters ?? 0;
    const confidence: MatchConfidence =
      distanceMeters + uncertainty <= HERE_RADIUS_METERS ? 'here' : 'nearby';

    matches.push({
      range,
      distanceMeters,
      confidence,
      label: preferKnownSpelling(formatRange(range), knownLocations),
    });
  }

  matches.sort((a, b) => {
    if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
    return a.label.localeCompare(b.label);
  });

  return matches;
}

/**
 * The one match worth offering as "you are here", or null.
 *
 * Null when the nearest is merely nearby, and — deliberately — also when two
 * ranges are both `here`: adjacent clubs sharing a site are common, and
 * picking one of them for the shooter would be a guess wearing a confident
 * face. They get the list instead.
 */
export function bestMatch(matches: readonly RangeMatch[]): RangeMatch | null {
  const here = matches.filter((match) => match.confidence === 'here');
  return here.length === 1 ? (here[0] ?? null) : null;
}
