// Share cards (plan.md v2): pure layout-data builders for the session and
// series share images. All labels arrive pre-localized (the caller resolves
// i18n/date formatting, same split as shared/src/export/pdf-log.ts) — these
// functions only shape the data: drop sighters from the series list, and
// turn a blank opt-in note into `null` so the renderer can skip the line.
// Never derive shooter identity or location here (CLAUDE.md rule 7 / plan.md
// "never include shooter identity or location automatically").

export interface ShareCardSeriesEntry {
  position: number;
  totalLabel: string;
  xCount: number;
}

export interface SessionShareCardModel {
  appName: string;
  dateLabel: string;
  disciplineLabel: string;
  weaponLabel: string | null;
  firearmLabel: string | null;
  totalLabel: string;
  averageLabel: string | null;
  xCount: number;
  series: readonly ShareCardSeriesEntry[];
  note: string | null;
}

export interface BuildSessionShareCardInput {
  appName: string;
  dateLabel: string;
  disciplineLabel: string;
  weaponLabel: string | null;
  firearmLabel: string | null;
  totalLabel: string;
  averageLabel: string | null;
  xCount: number;
  /** Every series row on the session, sighters included — filtered here. */
  series: readonly { position: number; isSighter: boolean; totalLabel: string; xCount: number }[];
  note: string | null;
}

export function buildSessionShareCard(input: BuildSessionShareCardInput): SessionShareCardModel {
  return {
    appName: input.appName,
    dateLabel: input.dateLabel,
    disciplineLabel: input.disciplineLabel,
    weaponLabel: input.weaponLabel || null,
    firearmLabel: input.firearmLabel || null,
    totalLabel: input.totalLabel,
    averageLabel: input.averageLabel,
    xCount: input.xCount,
    series: input.series
      .filter((row) => !row.isSighter)
      .map((row) => ({ position: row.position, totalLabel: row.totalLabel, xCount: row.xCount })),
    note: normalizeNote(input.note),
  };
}

export interface ShareCardShot {
  label: string;
  isX: boolean;
}

export interface SeriesShareCardModel {
  appName: string;
  dateLabel: string;
  disciplineLabel: string;
  seriesLabel: string;
  totalLabel: string;
  xCount: number;
  shots: readonly ShareCardShot[];
  note: string | null;
}

export interface BuildSeriesShareCardInput {
  appName: string;
  dateLabel: string;
  disciplineLabel: string;
  seriesLabel: string;
  totalLabel: string;
  xCount: number;
  shots: readonly ShareCardShot[];
  note: string | null;
}

export function buildSeriesShareCard(input: BuildSeriesShareCardInput): SeriesShareCardModel {
  return {
    appName: input.appName,
    dateLabel: input.dateLabel,
    disciplineLabel: input.disciplineLabel,
    seriesLabel: input.seriesLabel,
    totalLabel: input.totalLabel,
    xCount: input.xCount,
    shots: input.shots,
    note: normalizeNote(input.note),
  };
}

function normalizeNote(note: string | null): string | null {
  if (note === null) return null;
  const trimmed = note.trim();
  return trimmed === '' ? null : trimmed;
}
