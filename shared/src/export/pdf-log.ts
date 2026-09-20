// M6 (§4 M6): pure HTML builder for the shooting-log export (expo-print turns
// this into a PDF on the app side — no RN import here, so it's
// snapshot-testable with plain vitest per the M6 "Done when" clause).
//
// The layout matches the preprinted "Personlig skyttelogg" book a Swedish club
// issues, verified against real completed examples the maintainer supplied
// (2024 and 2026 licence applications, kept outside the working tree). Its
// columns are:
//
//   Datum | Plats | Skytteaktivitet | Använt vapen | Uppg. styrkta av
//
// Two of those the app had no equivalent of before (#308):
//
//   - "Använt vapen" is what demonstrates activity WITH a given firearm, which
//     the additional-handgun and renewal criteria on PM 551.24 both turn on.
//   - "Uppg. styrkta av" is a signature column, and on a paper log a row only
//     counts as evidence once it is signed. The app cannot sign anything, so
//     the column is rendered EMPTY and ruled, to be signed by hand. Filling it
//     in with anything the app knows would be manufacturing an attestation.
//
// Score and series count are deliberately not columns: they are not on the
// form, a föreningsintyg does not ask for them, and "Skytteaktivitet" is where
// what you did goes.

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
  location: string;
  /** What was shot — discipline and session type, as one phrase. */
  activity: string;
  /**
   * The firearm used. Never blank: a session with none recorded renders the
   * caller's "not recorded" label, because a six-month window that silently
   * drops rows loses sessions that did count (#308).
   */
  firearm: string;
}

export interface PdfLogColumnLabels {
  date: string;
  location: string;
  activity: string;
  firearm: string;
  /** Heading for the hand-signed column; its cells are always empty. */
  attestedBy: string;
  empty: string;
}

export interface PdfLogSummary {
  title: string;
  /** "Personlig skyttelogg för: <name>" — blank when no name is recorded. */
  shooterLabel: string | null;
  periodLabel: string;
  firearmLabel: string | null;
  totalSessions: number;
  totalShots: number;
  generatedAtLabel: string;
  /** Printed under the table: what the empty signature column is for. */
  attestationNote: string;
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
          <td>${escapeHtml(entry.location)}</td>
          <td>${escapeHtml(entry.activity)}</td>
          <td>${escapeHtml(entry.firearm)}</td>
          <td class="sign"></td>
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
  th, td { border: 1px solid #333; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  /* Ruled and empty: signed by hand, never by the app. */
  td.sign { min-width: 28%; height: 22px; }
  .note { font-size: 10px; color: #444; margin-top: 8px; }
  .empty { font-style: italic; color: #666; }
</style>
</head>
<body>
  <h1>${escapeHtml(summary.title)}</h1>
  <div class="summary">
    ${summary.shooterLabel ? `<div>${escapeHtml(summary.shooterLabel)}</div>` : ''}
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
      <tr><th>${escapeHtml(summary.columns.date)}</th><th>${escapeHtml(summary.columns.location)}</th><th>${escapeHtml(summary.columns.activity)}</th><th>${escapeHtml(summary.columns.firearm)}</th><th>${escapeHtml(summary.columns.attestedBy)}</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">${escapeHtml(summary.attestationNote)}</p>`
  }
</body>
</html>`;
}
