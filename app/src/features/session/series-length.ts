/**
 * Shots per series for a session: a fixed format decides first, then what was
 * chosen at creation (#348), then the discipline's default.
 */
export function resolveSeriesLength(
  programShotsPerSeries: number | null | undefined,
  sessionSeriesLength: number | null,
  disciplineDefault: number | null | undefined,
): number {
  return programShotsPerSeries ?? sessionSeriesLength ?? disciplineDefault ?? 5;
}

/**
 * The most shots a typed series length may ask for: the longest series any
 * shipped discipline or program uses (10, air pistol). The phone's keypad lays
 * out one cell per shot in a footer that does not scroll, so a longer series
 * would push the keys and Save off the screen (#837; the maintainer chose 10,
 * 2026-10-14).
 */
export const MAX_SERIES_LENGTH = 10;

/**
 * A series length as typed on New Session (and the web's Enter Series): whole
 * digits from 1 to `MAX_SERIES_LENGTH`, else null, which falls back to the
 * discipline's default. `1e2`, `5.0` and `5 5` are not.
 */
export function parseSeriesLength(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const length = Number(trimmed);
  return length >= 1 && length <= MAX_SERIES_LENGTH ? length : null;
}
