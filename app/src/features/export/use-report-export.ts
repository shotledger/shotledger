// JSON export of a generated analytics report: shared/src/export/json-log.ts
// over the same SessionExport[] the JSON sessions export assembles.
import type { TFunction } from 'i18next';
import { useState } from 'react';
import {
  buildAnalyticsReportJson,
  type AnalyticsRecords,
  type AnalyticsTotals,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { buildFirearmExports, buildSessionExports } from '@/db/json-export/build-export';
import { listTags } from '@/db/queries/tags';
import { localDateStamp } from '@/features/export/local-date-stamp';
import type { AnalyticsFilterState, PeriodRange } from '@/features/stats/use-stats-data';
import { shareJson } from '@/platform/export-file';

export interface ReportExportInput {
  filter: AnalyticsFilterState;
  range: PeriodRange;
  sessionIds: readonly string[];
  totals: AnalyticsTotals;
  records: AnalyticsRecords;
}

function filteredSessionExports(sessionIds: readonly string[]) {
  const allowed = new Set(sessionIds);
  return buildSessionExports(db).filter((session) => allowed.has(session.id));
}

export function useReportExport(t: TFunction) {
  const [status, setStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  async function exportJson(input: ReportExportInput): Promise<void> {
    const sessions = filteredSessionExports(input.sessionIds);
    const tagNames = new Map(listTags(db).map((tag) => [tag.id, tag.name]));
    const ok = await shareJson(
      buildAnalyticsReportJson({
        generatedAt: new Date().toISOString(),
        filter: {
          from: input.range.fromIso,
          to: input.range.toIso,
          sessionType: input.filter.sessionType,
          disciplineId: input.filter.disciplineId,
          shotsPerSeries: input.filter.shotsPerSeries,
          tags: input.filter.tagIds.map((id) => tagNames.get(id) ?? id),
          includeSighters: input.filter.includeSighters,
        },
        totals: input.totals,
        records: input.records,
        sessions,
        // Only the firearms the filtered sessions actually reference —
        // a six-month report should not carry the whole cabinet.
        firearms: buildFirearmExports(db).filter((firearm) =>
          sessions.some((session) => session.firearmId === firearm.id),
        ),
      }),
      `shotledger-report-${localDateStamp()}.json`,
    );
    setStatus(ok ? 'success' : 'failed');
  }

  const statusText =
    status === 'idle'
      ? null
      : status === 'success'
        ? t('stats.exportDone')
        : t('stats.exportFailed');

  return { exportJson, statusText };
}
