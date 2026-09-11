// Export of a generated analytics report in the format the user picks
// (maintainer: "an export button and then next user selects format").
//
// All three formats describe the same filtered set of sessions and reuse
// the existing exporters rather than duplicating them:
//   PDF  — shared/src/export/pdf-log.ts via use-pdf-export.ts, restricted
//          to the matched session ids.
//   JSON — shared/src/export/json-log.ts, over the same SessionExport[]
//          the CSV exporter assembles.
//   CSV  — shared/src/csv/export.ts, over that same SessionExport[].
// The document vault is not part of any of them.
import type { TFunction } from 'i18next';
import { useState } from 'react';
import {
  buildAnalyticsReportJson,
  type AnalyticsRecords,
  type AnalyticsTotals,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { buildSessionExports } from '@/db/json-export/build-export';
import { listTags } from '@/db/queries/tags';
import { buildShootingLogHtmlForFilters } from '@/features/export/use-pdf-export';
import type { AnalyticsFilterState, PeriodRange } from '@/features/stats/use-stats-data';
import { shareJson } from '@/platform/export-file';
import { exportHtmlAsPdf } from '@/platform/pdf-export';

export const EXPORT_FORMATS = ['pdf', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ReportExportInput {
  filter: AnalyticsFilterState;
  range: PeriodRange;
  sessionIds: readonly string[];
  totals: AnalyticsTotals;
  records: AnalyticsRecords;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function filteredSessionExports(sessionIds: readonly string[]) {
  if (!db) return [];
  const allowed = new Set(sessionIds);
  return buildSessionExports(db).filter((session) => allowed.has(session.id));
}

export function useReportExport(t: TFunction, locale: string) {
  const [status, setStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  async function exportAs(format: ExportFormat, input: ReportExportInput): Promise<void> {
    if (!db) {
      setStatus('failed');
      return;
    }

    let ok: boolean;
    if (format === 'pdf') {
      const html = buildShootingLogHtmlForFilters(t, locale, {
        startedFromIso: input.range.fromIso,
        startedToIso: input.range.toIso,
        firearmId: null,
        sessionIds: input.sessionIds,
      });
      ok = html !== null && (await exportHtmlAsPdf(html));
    } else {
      const sessions = filteredSessionExports(input.sessionIds);
      {
        const tagNames = new Map(listTags(db).map((tag) => [tag.id, tag.name]));
        ok = await shareJson(
          buildAnalyticsReportJson({
            generatedAt: new Date().toISOString(),
            filter: {
              from: input.range.fromIso,
              to: input.range.toIso,
              sessionType: input.filter.sessionType,
              disciplineId: input.filter.disciplineId,
              shotsPerSeries: input.filter.shotsPerSeries,
              tags: input.filter.tagIds.map((id) => tagNames.get(id) ?? id),
            },
            totals: input.totals,
            records: input.records,
            sessions,
          }),
          `shotledger-report-${stamp()}.json`,
        );
      }
    }

    setStatus(ok ? 'success' : 'failed');
  }

  const statusText =
    status === 'idle'
      ? null
      : status === 'success'
        ? t('stats.exportDone')
        : t('stats.exportFailed');

  return { exportAs, statusText };
}
