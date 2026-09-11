// Nearby shooting ranges, from OpenStreetMap via Overpass.
//
// Same bargain as photon.ts: a plain GET returning JSON, no API key, no
// account, no SDK — so this is `fetch` in the app rather than a new
// dependency. Results are OSM data (ODbL): every surface showing them must
// credit OSM_ATTRIBUTION.
//
// Privacy: this sends the shooter's coordinates to a third party, which is
// strictly more than photon.ts sends, so it lives behind the same opt-in
// setting and only ever runs when the user taps "Use my location".
//
// There is deliberately no bundled range database. Ranges open, close and get
// renamed, and a stale list that confidently names the wrong club is worse
// than no list at all.

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/** A shooting range as OSM knows it. */
export interface ShootingRange {
  /** `node/123`, `way/456` — stable across queries, so it deduplicates. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Town or municipality, when OSM carries one. Shown to disambiguate. */
  locality?: string;
}

/**
 * Overpass QL for every shooting range within `radiusMeters` of a point.
 *
 * `nwr` covers nodes, ways and relations in one clause — a range is mapped as
 * a point, an area or a multipolygon depending on who surveyed it. The `sport`
 * regex matches a semicolon list (`sport=shooting;archery` is common) without
 * also matching unrelated values that merely contain the word.
 */
export function buildRangeQuery(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 25,
): string {
  const around = `around:${Math.round(radiusMeters)},${latitude},${longitude}`;
  return [
    '[out:json][timeout:20];',
    `nwr(${around})["sport"~"(^|;)shooting($|;)"];`,
    `out center tags ${limit};`,
  ].join('');
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
  tags?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The element's own coordinates: `lat`/`lon` on a node, `center` on a way or
 * relation (which is what `out center` adds).
 */
function coordinates(element: OverpassElement): { latitude: number; longitude: number } | null {
  const latitude = num(element.lat);
  const longitude = num(element.lon);
  if (latitude !== null && longitude !== null) return { latitude, longitude };

  const center = element.center as OverpassElement | undefined;
  if (center && typeof center === 'object') {
    const centerLat = num(center.lat);
    const centerLon = num(center.lon);
    if (centerLat !== null && centerLon !== null) {
      return { latitude: centerLat, longitude: centerLon };
    }
  }
  return null;
}

interface RangeTags {
  name?: unknown;
  'name:sv'?: unknown;
  operator?: unknown;
  'addr:city'?: unknown;
  'addr:place'?: unknown;
}

/**
 * Parses an Overpass answer into ranges, skipping anything unusable.
 *
 * An unnamed range falls back to its operator — a club-run bana is often
 * tagged with the club and no name of its own, and "Malmö Skyttegille" is a
 * better suggestion than nothing. An element with neither is dropped: an
 * anonymous chip helps no one.
 */
export function parseOverpassRanges(body: unknown, limit = 25): ShootingRange[] {
  if (!body || typeof body !== 'object') return [];
  const elements = (body as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];

  const ranges: ShootingRange[] = [];
  const seen = new Set<string>();

  for (const raw of elements) {
    if (ranges.length >= limit) break;
    if (!raw || typeof raw !== 'object') continue;
    const element = raw as OverpassElement;

    const tags = (element.tags ?? {}) as RangeTags;
    const name = str(tags['name:sv']) ?? str(tags.name) ?? str(tags.operator);
    if (!name) continue;

    const position = coordinates(element);
    if (!position) continue;

    const type = str(element.type);
    const id = num(element.id);
    if (!type || id === null) continue;

    const key = `${type}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const locality = str(tags['addr:city']) ?? str(tags['addr:place']) ?? undefined;
    ranges.push({ id: key, name, ...position, ...(locality ? { locality } : {}) });
  }

  return ranges;
}

/** "Name, Locality" when OSM carries a locality, otherwise just the name. */
export function formatRange(range: ShootingRange): string {
  if (!range.locality || range.locality === range.name) return range.name;
  return `${range.name}, ${range.locality}`;
}
