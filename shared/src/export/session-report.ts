// Pure HTML builder for the per-session report (#499): a header, a session
// summary (results plus every scoring mark on one target), then one compact
// card per series with its target, marks, shot values and group figures. expo-print turns it into a PDF on the app side; nothing here
// imports RN, so it is testable with plain vitest, like pdf-log.ts.
//
// Shared does no i18n: every label and formatted value comes from the caller.
import { analyzeGroup } from '../scoring/group';
import type { TargetFaceDefinition } from '../target-scoring/targets';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SessionReportMark {
  /** Target-mm, origin at the center, y increasing downward. */
  xMm: number;
  yMm: number;
  caliberMm: number;
}

export interface SessionReportField {
  label: string;
  value: string;
}

export interface SessionReportSeries {
  /** "Series 3". */
  title: string;
  /** Short qualifiers printed beside the title ("Sighter", "Final"). */
  tags: readonly string[];
  /** The series total, already formatted. */
  total: string;
  /** Shot values in entry order, already formatted ("10", "X", "9"). */
  values: readonly string[];
  /** Empty for a series scored without a photo: it prints its values only. */
  marks: readonly SessionReportMark[];
  /** Windage, elevation, mean radius, max spread — empty below two marks. */
  figures: readonly SessionReportField[];
  /** The face this series is shot on; null draws no target. */
  target: TargetFaceDefinition | null;
}

/** Every scoring mark of the session on one face, with the group figures. */
export interface SessionReportPlot {
  caption: string;
  target: TargetFaceDefinition;
  marks: readonly SessionReportMark[];
  figures: readonly SessionReportField[];
}

export interface SessionReportSummary {
  /** The session's name. */
  title: string;
  /** Date, discipline, firearm — in the order given. */
  fields: readonly SessionReportField[];
  summaryHeading: string;
  /** The session's results (subtotals, total, averages), as the session screen shows them. */
  results: readonly SessionReportField[];
  /** One per face that carries marks; empty when no series has a photo. */
  plots: readonly SessionReportPlot[];
  /** Scored shots per value ("10" → "7"), highest first; null with none. */
  distribution: { heading: string; buckets: readonly SessionReportField[] } | null;
  generatedAtLabel: string;
  /** Printed instead of the cards when the session has no series. */
  emptyLabel: string;
}

// A printed target keeps its paper and ink colors, as components/target-face.tsx.
const PAPER = '#f4f0e8';
const INK = '#1c1c1e';
const ON_BLACK = '#f2ede3';
// Marks and group overlay, as components/group-plot.tsx.
const SHOT_FILL = '#2563eb';
const SHOT_STROKE = '#93c5fd';
const OVERLAY = '#dc2626';

/** Rounded so the markup stays short and the snapshot stable. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Half-width of the printed view in target-mm: the ring that holds every
 * mark, one ring further out, plus a margin. A whole 25 m face at card size
 * draws a .22 hole a pixel or two wide.
 */
export function reportViewHalfMm(
  target: TargetFaceDefinition,
  marks: readonly SessionReportMark[],
): number {
  const radii = target.rings.map((ring) => ring.diameterMm / 2);
  const outermost = radii[radii.length - 1] ?? 1;
  const reach = Math.max(0, ...marks.map((m) => Math.hypot(m.xMm, m.yMm) + m.caliberMm / 2));
  const holding = radii.findIndex((r) => r >= reach);
  if (holding < 0) return Math.max(outermost, reach) * 1.05;
  return Math.min(outermost, radii[holding + 1] ?? outermost) * 1.05;
}

/**
 * The target face with its marks as an inline SVG string, drawn in target-mm
 * user space — the string twin of `TargetFace` + `GroupPlot` in the app,
 * framed on the marks by `reportViewHalfMm`.
 */
export function targetFaceSvg(
  target: TargetFaceDefinition,
  marks: readonly SessionReportMark[],
  sizePx: number,
): string {
  const half = reportViewHalfMm(target, marks);
  const extent = half * 2;
  const stroke = extent / 250;
  const fontSize = extent * 0.032;
  const blackOuter = target.referenceDiameterMm / 2;
  // An annulus face's light center is approximated by its innermost ring.
  const blackInner = target.referenceIsSolidBlack ? 0 : (target.rings[0]?.diameterMm ?? 0) / 2;
  const onBlack = (r: number) => r <= blackOuter && r > blackInner;

  const parts: string[] = [
    `<rect x="${n(-half)}" y="${n(-half)}" width="${n(extent)}" height="${n(extent)}" fill="${PAPER}"/>`,
    `<circle cx="0" cy="0" r="${n(blackOuter)}" fill="${INK}"/>`,
  ];
  if (blackInner > 0) parts.push(`<circle cx="0" cy="0" r="${n(blackInner)}" fill="${PAPER}"/>`);
  for (const ring of target.rings) {
    const r = ring.diameterMm / 2;
    parts.push(
      `<circle cx="0" cy="0" r="${n(r)}" fill="none" stroke="${onBlack(r) ? ON_BLACK : INK}" stroke-width="${n(stroke)}"/>`,
    );
  }
  target.rings.forEach((ring, index) => {
    const inner = target.rings[index - 1];
    if (!inner || ring.isInnerTen) return;
    const innerR = inner.diameterMm / 2;
    const mid = (innerR + ring.diameterMm / 2) / 2;
    // The bands too narrow to hold a digit go without, as on the printed face.
    if (mid - innerR < fontSize * 0.3 * String(ring.value).length) return;
    for (const x of [-mid, mid]) {
      parts.push(
        `<text x="${n(x)}" y="${n(fontSize * 0.35)}" font-size="${n(fontSize)}" fill="${onBlack(mid) ? ON_BLACK : INK}" text-anchor="middle">${ring.value}</text>`,
      );
    }
  });
  for (const mark of marks) {
    parts.push(
      `<circle cx="${n(mark.xMm)}" cy="${n(mark.yMm)}" r="${n(mark.caliberMm / 2)}" fill="${SHOT_FILL}" stroke="${SHOT_STROKE}" stroke-width="${n(mark.caliberMm / 8)}" opacity="0.85"/>`,
    );
  }
  const group = marks.length >= 2 ? analyzeGroup(marks) : null;
  if (group) {
    const w = n(extent / 200);
    const arm = extent * 0.015;
    const { xMm: x, yMm: y } = group.mpiMm;
    parts.push(
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(group.meanRadiusMm)}" fill="none" stroke="${OVERLAY}" stroke-width="${w}"/>`,
      `<line x1="${n(x - arm)}" y1="${n(y)}" x2="${n(x + arm)}" y2="${n(y)}" stroke="${OVERLAY}" stroke-width="${w}"/>`,
      `<line x1="${n(x)}" y1="${n(y - arm)}" x2="${n(x)}" y2="${n(y + arm)}" stroke="${OVERLAY}" stroke-width="${w}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${n(-half)} ${n(-half)} ${n(extent)} ${n(extent)}">${parts.join('')}</svg>`;
}

function figuresTable(figures: readonly SessionReportField[]): string {
  if (figures.length === 0) return '';
  return `<table class="figures">${figures
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td>${escapeHtml(f.value)}</td></tr>`)
    .join('')}</table>`;
}

function summarySection(summary: SessionReportSummary): string {
  const results = summary.results
    .map(
      (f) =>
        `<div class="result"><div class="result-value">${escapeHtml(f.value)}</div><div class="result-label">${escapeHtml(f.label)}</div></div>`,
    )
    .join('');
  const plots = summary.plots
    .map(
      (plot) => `<div class="plot">
      <div class="plot-caption">${escapeHtml(plot.caption)}</div>
      <div class="face">${targetFaceSvg(plot.target, plot.marks, 240)}</div>
      ${figuresTable(plot.figures)}
    </div>`,
    )
    .join('');
  const { distribution } = summary;
  const distributionTable = distribution
    ? `<div class="distribution">
      <div class="plot-caption">${escapeHtml(distribution.heading)}</div>
      <table><tr>${distribution.buckets.map((b) => `<th>${escapeHtml(b.label)}</th>`).join('')}</tr><tr>${distribution.buckets
        .map((b) => `<td>${escapeHtml(b.value)}</td>`)
        .join('')}</tr></table>
    </div>`
    : '';
  return `<section class="summary">
    <h2>${escapeHtml(summary.summaryHeading)}</h2>
    <div class="summary-body">
      ${plots ? `<div class="plots">${plots}</div>` : ''}
      <div class="summary-numbers">
        <div class="results">${results}</div>
        ${distributionTable}
      </div>
    </div>
  </section>`;
}

function seriesCard(series: SessionReportSeries): string {
  const { target } = series;
  const tags = series.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const face =
    target && series.marks.length > 0
      ? `<div class="face">${targetFaceSvg(target, series.marks, 200)}</div>`
      : '';
  const values = series.values.map((v) => `<span class="value">${escapeHtml(v)}</span>`).join('');
  const figures = figuresTable(series.figures);
  return `<div class="card">
    <div class="card-head"><span class="series-title">${escapeHtml(series.title)}</span>${tags}<span class="total">${escapeHtml(series.total)}</span></div>
    ${face}
    <div class="values">${values}</div>
    ${figures}
  </div>`;
}

/** Builds the session report HTML. Pure — no I/O, no RN. */
export function buildSessionReportHtml(
  summary: SessionReportSummary,
  series: readonly SessionReportSeries[],
): string {
  const fields = summary.fields
    .map(
      (f) =>
        `<div class="field"><span class="label">${escapeHtml(f.label)}</span> ${escapeHtml(f.value)}</div>`,
    )
    .join('');
  const body =
    series.length === 0
      ? `<p class="empty">${escapeHtml(summary.emptyLabel)}</p>`
      : `${summarySection(summary)}<div class="grid">${series.map(seriesCard).join('')}</div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 14mm; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .fields { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; margin-bottom: 4px; }
  .label { color: #555; }
  .generated { font-size: 10px; color: #666; margin-bottom: 12px; }
  /* Three series across, like TargetScan's side-by-side session report. */
  h2 { font-size: 14px; margin: 0 0 8px; }
  .summary { border: 1px solid #ccc; border-radius: 6px; padding: 10px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
  .results { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-bottom: 8px; }
  .result-value { font-size: 18px; font-weight: 700; }
  .result-label { font-size: 10px; color: #555; }
  .summary-body { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .summary-numbers { flex: 1; min-width: 200px; }
  .plots { display: flex; flex-wrap: wrap; gap: 16px; }
  .distribution table { border-collapse: collapse; font-size: 11px; margin-top: 2px; }
  .distribution th, .distribution td { border: 1px solid #ccc; padding: 2px 6px; text-align: center; }
  .distribution th { background: #f2f2f2; font-weight: 600; }
  .plot { width: 240px; }
  .plot-caption { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
  .plot .face svg { max-width: 240px; }
  /* align-items: a card without a target keeps its own height beside one with. */
  .grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
  .card { width: calc((100% - 20px) / 3); box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; padding: 8px; break-inside: avoid; page-break-inside: avoid; }
  .card-head { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 6px; }
  .series-title { font-weight: 600; }
  .tag { font-size: 9px; border: 1px solid #999; border-radius: 8px; padding: 0 5px; color: #444; }
  .total { margin-left: auto; font-weight: 700; font-size: 14px; }
  .face { text-align: center; }
  .face svg { width: 100%; height: auto; max-width: 200px; }
  .values { display: flex; flex-wrap: wrap; gap: 3px; margin: 6px 0 4px; }
  .value { font-size: 11px; font-weight: 600; border: 1px solid #bbb; border-radius: 3px; min-width: 18px; text-align: center; padding: 1px 2px; }
  .figures { width: 100%; border-collapse: collapse; font-size: 10px; }
  .figures td { padding: 1px 0; }
  .figures td:last-child { text-align: right; }
  .empty { font-style: italic; color: #666; }
</style>
</head>
<body>
  <h1>${escapeHtml(summary.title)}</h1>
  <div class="fields">${fields}</div>
  <div class="generated">${escapeHtml(summary.generatedAtLabel)}</div>
  ${body}
</body>
</html>`;
}
