/** The Statistics report's sections, in page order (#588). */
export type ReportSectionKey =
  | 'shots'
  | 'records'
  | 'totals'
  | 'falt'
  | 'typeComparison'
  | 'sighter'
  | 'charts'
  | 'distribution'
  | 'export';

export interface ReportContents {
  hasCrossSession: boolean;
  hasMatches: boolean;
  showRingCards: boolean;
  hasFalt: boolean;
  hasTypeComparison: boolean;
  hasSighterRelation: boolean;
}

/** The sections this report renders, mirroring the conditions in `report.tsx`. */
export function reportSections(c: ReportContents): ReportSectionKey[] {
  const keys: ReportSectionKey[] = [];
  if (c.hasCrossSession) keys.push('shots');
  if (!c.hasMatches) return keys;
  if (c.showRingCards) keys.push('records');
  keys.push('totals');
  if (c.hasFalt) keys.push('falt');
  if (c.showRingCards) {
    if (c.hasTypeComparison) keys.push('typeComparison');
    if (c.hasSighterRelation) keys.push('sighter');
    keys.push('charts', 'distribution');
  }
  keys.push('export');
  return keys;
}

/** Below this the report is short enough that an index is clutter. */
export const MIN_INDEXED_SECTIONS = 3;
