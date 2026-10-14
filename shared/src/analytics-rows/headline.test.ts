import { describe, expect, it } from 'vitest';

import { statsHeadline } from './headline';
import type { AnalyticsReportData } from './report';

/** Only the fields the headline reads; the rest of a report is irrelevant to it. */
function report(fields: {
  showRingCards: boolean;
  meanSeriesTenths?: number | null;
  hitRate?: number | null;
}): AnalyticsReportData {
  return {
    showRingCards: fields.showRingCards,
    totals: { meanSeriesTenths: fields.meanSeriesTenths ?? null },
    falt: fields.hitRate === undefined ? null : { totals: { hitRate: fields.hitRate }, points: [] },
  } as unknown as AnalyticsReportData;
}

describe('statsHeadline', () => {
  it('leads a hits report with the fält hit rate, compared with the period before', () => {
    expect(
      statsHeadline(
        report({ showRingCards: false, hitRate: 0.75 }),
        report({ showRingCards: false, hitRate: 0.5 }),
      ),
    ).toEqual({ kind: 'hitRate', value: 0.75, previous: 0.5, delta: 0.25 });
  });

  it('has no trend when the period before had no fält', () => {
    expect(
      statsHeadline(
        report({ showRingCards: false, hitRate: 0.75 }),
        report({ showRingCards: false }),
      ),
    ).toEqual({ kind: 'hitRate', value: 0.75, previous: null, delta: null });
  });

  it('has nothing to lead with when there is neither a ring card nor fält', () => {
    expect(statsHeadline(report({ showRingCards: false }), null)).toBeNull();
  });

  it('shows no value and no trend when nothing in the period is scored', () => {
    expect(
      statsHeadline(
        report({ showRingCards: true, meanSeriesTenths: null }),
        report({ showRingCards: true, meanSeriesTenths: 900 }),
      ),
    ).toEqual({ kind: 'meanPerSeries', value: null, previous: 90, delta: null });
  });
});
