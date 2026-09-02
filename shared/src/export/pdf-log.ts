// M6 PDF export (§4 M6): pure HTML builder for the shooting-log export
// (expo-print turns this into a PDF on the app side — no RN import here, so
// it's snapshot-testable with plain vitest per the M6 "Done when" clause).
//
// VERIFY: this layout has NOT been checked against a real föreningsintyg
// attachment example. It is a sensible club-log table (date, discipline,
// type, series count, score, location) plus a summary header, per
// implementation-plan.md §4 M6 — the maintainer should compare it to an
// actual example before this is relied on for an intyg submission.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PdfLogEntry {
  date: string;
  discipline: string;
  type: string;
  seriesCount: number;
  score: string;
  location: string;
}

export interface PdfLogColumnLabels {
  date: string;
  discipline: string;
  type: string;
  seriesCount: string;
  score: string;
  location: string;
  empty: string;
}

export interface PdfLogSummary {
  title: string;
  periodLabel: string;
  firearmLabel: string | null;
  totalSessions: number;
  totalShots: number;
  generatedAtLabel: string;
  columns: PdfLogColumnLabels;
}

/** Builds the shooting-log HTML string. Pure — no I/O, no RN. */
export function buildShootingLogHtml(
  summary: PdfLogSummary,
  entries: readonly PdfLogEntry[],
): string {
  const rows = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.discipline)}</td>
          <td>${escapeHtml(entry.type)}</td>
          <td>${entry.seriesCount}</td>
          <td>${escapeHtml(entry.score)}</td>
          <td>${escapeHtml(entry.location)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .summary { font-size: 12px; color: #444; margin-bottom: 16px; }
  .summary div { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f2f2f2; }
  .empty { font-style: italic; color: #666; }
</style>
</head>
<body>
  <h1>${escapeHtml(summary.title)}</h1>
  <div class="summary">
    <div>${escapeHtml(summary.periodLabel)}</div>
    ${summary.firearmLabel ? `<div>${escapeHtml(summary.firearmLabel)}</div>` : ''}
    <div>${summary.totalSessions} · ${summary.totalShots}</div>
    <div>${escapeHtml(summary.generatedAtLabel)}</div>
  </div>
  ${
    entries.length === 0
      ? `<p class="empty">${escapeHtml(summary.columns.empty)}</p>`
      : `<table>
    <thead>
      <tr><th>${escapeHtml(summary.columns.date)}</th><th>${escapeHtml(summary.columns.discipline)}</th><th>${escapeHtml(summary.columns.type)}</th><th>${escapeHtml(summary.columns.seriesCount)}</th><th>${escapeHtml(summary.columns.score)}</th><th>${escapeHtml(summary.columns.location)}</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</body>
</html>`;
}
