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
