/**
 * The sections below the Statistics lead, in page order (#588). The lead
 * itself (headline, chart, detail, where shots land, counts) sits above the
 * index and is not in it (#822).
 */
export type ReportSectionKey =
  'records' | 'totals' | 'falt' | 'typeComparison' | 'sighter' | 'charts' | 'shots' | 'export';

export interface ReportContents {
  hasCrossSession: boolean;
  hasMatches: boolean;
  showRingCards: boolean;
  hasFalt: boolean;
  hasTypeComparison: boolean;
  hasSighterRelation: boolean;
}

/**
 * The sections the results render below the lead, mirroring the conditions
 * in `stats-results.tsx`. No matches renders the empty state and no index.
 */
export function reportSections(c: ReportContents): ReportSectionKey[] {
  if (!c.hasMatches) return [];
  const keys: ReportSectionKey[] = [];
  if (c.showRingCards) keys.push('records', 'totals');
  if (c.hasFalt) keys.push('falt');
  if (c.showRingCards) {
    if (c.hasTypeComparison) keys.push('typeComparison');
    if (c.hasSighterRelation) keys.push('sighter');
    keys.push('charts');
  }
  if (c.hasCrossSession) keys.push('shots');
  keys.push('export');
  return keys;
}

/** Below this the report is short enough that an index is clutter. */
export const MIN_INDEXED_SECTIONS = 3;
