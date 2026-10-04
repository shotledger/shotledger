// Optional online place lookup for the Location field. Photon
// (https://photon.komoot.io) is an OpenStreetMap geocoder built for
// type-ahead: no API key, no account, no SDK — a plain GET returning GeoJSON,
// which is why this is `fetch` in the app rather than a new dependency.
// Results are OSM data (ODbL): every surface showing them must credit
// "© OpenStreetMap contributors".
//
// Privacy: calling this sends the user's keystrokes to a third party, so the
// app keeps it behind an opt-in setting that is OFF by default and falls back
// to the local recents (recent-locations.ts) whenever it is off or fails.

export const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export function buildPhotonUrl(query: string, limit = 5, language?: string): string {
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  // Photon only knows a handful of languages; anything else is left to its
  // default rather than risking an error response.
  if (language && ['de', 'en', 'fr', 'it'].includes(language)) params.set('lang', language);
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

interface PhotonProperties {
  name?: unknown;
  street?: unknown;
  housenumber?: unknown;
  city?: unknown;
  district?: unknown;
  county?: unknown;
  state?: unknown;
  country?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** "Name, City, Country" — the parts that exist, in that order, deduplicated. */
export function formatPhotonFeature(properties: PhotonProperties): string | null {
  const street = str(properties.street);
  const housenumber = str(properties.housenumber);
  const head =
    str(properties.name) ?? (street ? (housenumber ? `${street} ${housenumber}` : street) : null);
  if (!head) return null;

  const parts = [
    head,
    str(properties.city) ?? str(properties.district) ?? str(properties.county),
    str(properties.country),
  ].filter((part): part is string => part !== null);

  const seen = new Set<string>();
  return parts.filter((part) => !seen.has(part) && seen.add(part)).join(', ');
}

/**
 * Display strings from a Photon GeoJSON response. Anything unexpected yields
 * `[]` rather than throwing: a malformed reply must degrade to "no online
 * suggestions", never break typing.
 */
export function parsePhotonResponse(body: unknown, limit = 5): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    if (typeof feature !== 'object' || feature === null) continue;
    const properties = (feature as { properties?: unknown }).properties;
    if (typeof properties !== 'object' || properties === null) continue;
    const label = formatPhotonFeature(properties);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}
