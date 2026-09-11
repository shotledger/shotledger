// Searching and grouping the photo gallery. Pure, so the rules are testable
// without a database or a renderer.

export interface GalleryPhoto {
  seriesId: string;
  sessionId: string;
  position: number;
  photoUri: string;
  sessionName: string;
  /** ISO-8601. */
  startedAt: string;
  location: string | null;
  disciplineId: string | null;
}

/** Trimmed, inner whitespace collapsed, case-folded — the same normalisation the location recents use. */
function fold(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Free-text search across the fields a shooter would actually remember: the
 * session's name, where they were, and the discipline. Not the date — a date
 * is what the period filter is for, and matching "2026" against an ISO string
 * would also match every session shot at 20:26.
 *
 * Every whitespace-separated term must match somewhere (AND, not OR), so
 * adding a word narrows rather than widens.
 */
export function searchPhotos(photos: readonly GalleryPhoto[], query: string): GalleryPhoto[] {
  const terms = fold(query)
    .split(' ')
    .filter((term) => term !== '');
  if (terms.length === 0) return [...photos];

  return photos.filter((photo) => {
    const haystack = fold(
      [photo.sessionName, photo.location ?? '', photo.disciplineId ?? ''].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/** Inclusive on both ends, comparing the date part only. */
export function filterPhotosByDate(
  photos: readonly GalleryPhoto[],
  from: string | null,
  to: string | null,
): GalleryPhoto[] {
  return photos.filter((photo) => {
    const day = photo.startedAt.slice(0, 10);
    if (from !== null && day < from.slice(0, 10)) return false;
    if (to !== null && day > to.slice(0, 10)) return false;
    return true;
  });
}

export interface PhotoGroup {
  /** ISO date, `YYYY-MM-DD`. */
  day: string;
  photos: GalleryPhoto[];
}

/**
 * Groups by the day the session started, newest first, so the gallery reads
 * as a timeline rather than an undifferentiated grid. Order within a day is
 * whatever the caller supplied — the query already sorts by series position.
 */
export function groupPhotosByDay(photos: readonly GalleryPhoto[]): PhotoGroup[] {
  const byDay = new Map<string, GalleryPhoto[]>();
  for (const photo of photos) {
    const day = photo.startedAt.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(photo);
    else byDay.set(day, [photo]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, group]) => ({ day, photos: group }));
}

/** The distinct locations present, for the filter chips. Blank ones are dropped. */
export function photoLocations(photos: readonly GalleryPhoto[]): string[] {
  const seen = new Map<string, string>();
  for (const photo of photos) {
    const location = photo.location?.trim();
    if (!location) continue;
    if (!seen.has(fold(location))) seen.set(fold(location), location);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
