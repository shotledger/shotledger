import { reportSections, type ReportContents } from './report-sections';

const ring: ReportContents = {
  hasCrossSession: false,
  hasMatches: true,
  showRingCards: true,
  hasFalt: false,
  hasTypeComparison: false,
  hasSighterRelation: false,
};

describe('reportSections', () => {
  it('lists a ring report in page order', () => {
    expect(reportSections(ring)).toEqual(['records', 'totals', 'charts', 'distribution', 'export']);
  });

  it('adds every optional card where the report renders it', () => {
    expect(
      reportSections({
        ...ring,
        hasCrossSession: true,
        hasFalt: true,
        hasTypeComparison: true,
        hasSighterRelation: true,
      }),
    ).toEqual([
      'shots',
      'records',
      'totals',
      'falt',
      'typeComparison',
      'sighter',
      'charts',
      'distribution',
      'export',
    ]);
  });

  it('leaves out the ring cards for a fält-only report', () => {
    expect(
      reportSections({
        ...ring,
        showRingCards: false,
        hasFalt: true,
        hasTypeComparison: true,
        hasSighterRelation: true,
      }),
    ).toEqual(['totals', 'falt', 'export']);
  });

  it('keeps only the shot plot when the filter matched no sessions', () => {
    expect(reportSections({ ...ring, hasMatches: false, hasCrossSession: true })).toEqual([
      'shots',
    ]);
    expect(reportSections({ ...ring, hasMatches: false })).toEqual([]);
  });
});
