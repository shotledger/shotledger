// Statistics on the web (#822, direction A), in the phone's order: results
// first, under a sticky Filter Bar. The headline with its trend and chart,
// the detail, where shots land and the counts lead, as on the phone's tab
// (app/src/features/stats/stats-results.tsx, `StatsResults`); the rest of the
// report follows. Every number comes from composeAnalyticsReport, and the
// trend from statsHeadline over previousPeriodRange, the functions the phone
// runs (app/src/features/stats/use-stats-data.ts, `useAnalyticsReport`).
import {
  buildFilterOptions,
  statsHeadline,
  type AnalyticsFilterState,
  type AnalyticsReportData,
  type NamedRecord,
} from '@shotledger/shared/src/analytics-rows';
import type { SighterRelation } from '@shotledger/shared/src/scoring/sighter-relation';
import type {
  SessionTypeComparison,
  SessionTypeSide,
} from '@shotledger/shared/src/scoring/session-type-comparison';
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import type { TFunction } from 'i18next';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CHART_LINE_COLORS,
  groupByDiscipline,
  type DisciplinePoint,
} from '../../app/src/components/time-series-chart-math';
import { nextSessionDeadline } from '../../app/src/features/compliance/next-session';
import { disciplineLabel } from '../../app/src/features/session/labels';
import { formatTotalScore } from '../../app/src/features/stats/format-total-score';
import { overallLicenseActivity } from './license-activity';
import { licenseCheckHash } from './shell/route';
import { periodLabel, trendLine } from '../../app/src/features/stats/stats-filters';
import type { PulledTables } from './pull';
import { BarChart, LineChart, ScatterPlot } from './report/charts';
import { FilterBar } from './report/filters';
import { statsInputs, statsReport } from './stats-inputs';
import { showAxisDate, showDate, showDay } from './dates';

const DASH = '–';
const score = (tenths: number | null, digits = 1) =>
  tenths === null ? DASH : tenthsToScore(tenths).toFixed(digits);
const percent = (share: number | null) => (share === null ? DASH : `${(share * 100).toFixed(0)}%`);

function Tile({ label, value, id }: { label: string; value: string; id?: string }) {
  return (
    <div className="tile" data-testid={id}>
      <span className="tile-value">{value}</span>
      <span className="tile-label muted">{label}</span>
    </div>
  );
}

function Card({ title, wide, children }: { title?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={wide ? 'card wide' : 'card'}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

const ACTIVITY_LABEL = {
  green: 'compliance.licenseActivityGreen',
  amber: 'compliance.licenseActivityAmber',
  red: 'compliance.licenseActivityRed',
} as const;

/**
 * The phone's Home chip (`useOverallLicenseActivity`): the whole log, not the
 * filtered report, so it sits above the filters. Primary when not on track.
 */
function LicenseActivityLine({ tables }: { tables: PulledTables }) {
  const { t } = useTranslation();
  const overall = useMemo(() => overallLicenseActivity(tables), [tables]);
  if (overall === null) return null;
  const { status, lapseIso } = overall;
  return (
    <a
      className="license-activity"
      href={licenseCheckHash({ view: 'overview' })}
      title={t('compliance.check.open')}
    >
      <span>
        {t('compliance.licenseActivityTitle')}{' '}
        <span className={status === 'green' ? 'badge' : 'badge alert'}>
          {t(ACTIVITY_LABEL[status])}
        </span>
      </span>
      {lapseIso && (
        <span className="muted">
          {t('compliance.nextSessionBy', { date: showDate(nextSessionDeadline(lapseIso)) })}
        </span>
      )}
    </a>
  );
}

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function Statistics({
  tables,
  filter,
  onFilterChange: setFilter,
}: {
  tables: PulledTables;
  /** Held by the app, so it outlives a visit to another page. */
  filter: AnalyticsFilterState;
  onFilterChange: (next: AnalyticsFilterState) => void;
}) {
  const { t } = useTranslation();
  const inputs = useMemo(() => statsInputs(tables), [tables]);
  const options = useMemo(() => buildFilterOptions(inputs), [inputs]);
  const { data, previous } = useMemo(() => statsReport(filter, inputs), [filter, inputs]);

  if (!options.hasAnyData) {
    return (
      <div className="stats-page">
        <LicenseActivityLine tables={tables} />
        <section className="card">
          <h2>{t('stats.emptyTitle')}</h2>
          <p className="muted">{t('stats.emptyBody')}</p>
        </section>
      </div>
    );
  }

  const colors = CHART_LINE_COLORS[prefersDark() ? 'dark' : 'light'];
  const label = (id: string) => disciplineLabel(t, id);
  const chart: ChartRenderer = (chartLabel, points, pick) => {
    const grouped = groupByDiscipline(points, pick, label, colors);
    return (
      <LineChart
        label={chartLabel}
        grouped={grouped}
        formatDate={showAxisDate}
        emptyLabel={t('stats.trendEmpty')}
        omittedLabel={
          grouped.omittedCount === 0
            ? null
            : t('stats.chartDisciplinesOmitted', { count: grouped.omittedCount })
        }
      />
    );
  };

  return (
    <div className="stats-page">
      <LicenseActivityLine tables={tables} />
      <FilterBar
        state={filter}
        options={options}
        summary={`${periodLabel(t, filter, showDay)} · ${t('sessions.count', {
          count: data.totals.sessionCount,
        })}`}
        onChange={setFilter}
      />
      {!data.hasMatches ? (
        <section className="card">
          <h2>{t('stats.emptyFilteredTitle')}</h2>
          <p className="muted">{t('stats.emptyFilteredBody')}</p>
        </section>
      ) : (
        <Sections
          filter={filter}
          data={data}
          previous={previous}
          t={t}
          formatDate={showDate}
          chart={chart}
        />
      )}
    </div>
  );
}

type ChartRenderer = <P extends DisciplinePoint>(
  label: string,
  points: readonly P[],
  /** In points, as the axis prints them. */
  pick: (point: P) => number | null,
) => ReactNode;

const points = (tenths: number | null) => (tenths === null ? null : tenthsToScore(tenths));

function Sections({
  filter,
  data,
  previous,
  t,
  formatDate,
  chart,
}: {
  filter: AnalyticsFilterState;
  data: AnalyticsReportData;
  previous: AnalyticsReportData | null;
  t: TFunction;
  formatDate: (iso: string) => string;
  chart: ChartRenderer;
}) {
  const record = (name: string, entry: NamedRecord | null, value: string) =>
    entry === null ? (
      <p className="muted">{t('stats.recordNone', { label: name })}</p>
    ) : (
      <div className="record">
        <span>
          {name}
          <br />
          {/* Opens the session it came from, as the phone's record does. */}
          <a href={`#sessions/${encodeURIComponent(entry.sessionId)}`}>{entry.sessionName}</a>
          <span className="muted"> · {formatDate(entry.startedAt)}</span>
        </span>
        <strong>{value}</strong>
      </div>
    );
  const totals = data.totals;
  const headline = statsHeadline(data, previous);
  const trend = trendLine(t, filter, data, previous);
  const faltLeads = headline?.kind === 'hitRate';
  const faltChart = data.falt
    ? chart(t('stats.chartFaltHitsPerStation'), data.falt.points, (p) => p.hitsPerStation)
    : null;

  return (
    <div className="grid">
      {headline && (
        <Card wide>
          <div className="headline">
            <span className="headline-value" data-testid="stats-headline">
              {faltLeads
                ? percent(headline.value)
                : headline.value === null
                  ? DASH
                  : headline.value.toFixed(1)}
            </span>
            <span className="muted">
              {faltLeads ? t('stats.faltHitRate') : t('statsA.headlineMeanPerSeries')}
            </span>
            {trend && <span className="muted">{trend}</span>}
          </div>
          {faltLeads
            ? faltChart
            : chart(t('statsA.headlineMeanPerSeries'), data.points, (p) =>
                points(p.meanSeriesTotalTenths),
              )}
        </Card>
      )}

      {data.showRingCards && (
        <Card>
          {/* X is always counted, 0 included. */}
          <div className="tiles">
            <Tile label={t('stats.mean')} value={score(totals.meanShotTenths)} />
            <Tile label={t('statsA.shotSd')} value={score(data.sdTenths, 2)} />
            <Tile
              label={t('stats.xPercent')}
              value={
                totals.scoredShotCount === 0
                  ? DASH
                  : percent(totals.innerTenCount / totals.scoredShotCount)
              }
            />
            <Tile label={t('stats.innerTens')} value={String(totals.innerTenCount)} />
          </div>
        </Card>
      )}

      {data.showRingCards && (
        <Card title={t('statsA.distributionTitle')}>
          {data.distribution.length === 0 ? (
            <p className="muted">{t('stats.distributionEmpty')}</p>
          ) : (
            <>
              <BarChart label={t('statsA.distributionTitle')} buckets={data.distribution} />
              <p className="caption muted">
                {t('statsA.distributionCaption', {
                  count: totals.scoredShotCount,
                  x: totals.innerTenCount,
                })}
              </p>
            </>
          )}
        </Card>
      )}

      <Card>
        <div className="tiles">
          <Tile label={t('stats.sessions')} value={String(totals.sessionCount)} />
          <Tile label={t('stats.totalShots')} value={String(totals.volumeShotCount)} />
          <Tile label={t('statsA.competitions')} value={String(data.competitionCount)} />
        </div>
      </Card>

      {data.showRingCards && (
        <Card title={t('stats.summaryTitle')}>
          {record(
            t('stats.recordSessionScore'),
            data.bestSessionScore,
            formatTotalScore(data.bestSessionScore?.value ?? null),
          )}
          {record(
            t('stats.recordInnerTens'),
            data.mostInnerTens,
            String(data.mostInnerTens?.value ?? DASH),
          )}
          {record(t('stats.recordTens'), data.mostTens, String(data.mostTens?.value ?? DASH))}
        </Card>
      )}

      {data.showRingCards && (
        <Card title={t('stats.sumTitle')}>
          <div className="tiles">
            <Tile label={t('stats.totalScore')} value={formatTotalScore(totals.sumTenths)} />
            <Tile label={t('stats.seriesCount')} value={String(totals.scoredSeriesCount)} />
            <Tile label={t('stats.tens')} value={String(totals.tenCount)} />
            {/* SPSF-specific, so only where there is one, as on the phone. */}
            {data.goldSeriesCount > 0 && (
              <Tile label={t('stats.goldSeriesCount')} value={String(data.goldSeriesCount)} />
            )}
          </div>
        </Card>
      )}

      {data.falt && (
        <Card title={disciplineLabel(t, 'spsf-falt')}>
          <div className="tiles">
            <Tile label={t('stats.faltStations')} value={String(data.falt.totals.stationCount)} />
            <Tile label={t('stats.faltHitRate')} value={percent(data.falt.totals.hitRate)} />
            <Tile label={t('stats.faltHits')} value={String(data.falt.totals.hits)} />
            <Tile label={t('stats.faltFiguresHit')} value={String(data.falt.totals.figuresHit)} />
          </div>
          {/* Already the lead chart when the hit rate is the headline. */}
          {!faltLeads && (
            <>
              <h3>{t('stats.chartFaltHitsPerStation')}</h3>
              {faltChart}
            </>
          )}
        </Card>
      )}

      {data.showRingCards && (
        <>
          {data.typeComparison.length > 0 && <TypeComparison rows={data.typeComparison} t={t} />}
          {data.sighterRelation.length > 0 && (
            <SighterRelations entries={data.sighterRelation} t={t} />
          )}
          <Card title={t('stats.chartShotMean')}>
            {chart(t('stats.chartShotMean'), data.points, (p) => points(p.meanShotTenths))}
          </Card>
          <Card title={t('stats.chartSessionScore')}>
            {chart(t('stats.chartSessionScore'), data.points, (p) =>
              p.scoredSeriesCount === 0 ? null : points(p.sessionTotalTenths),
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** Half a tenth: below it the gap rounds to 0.0 points (as on the phone). */
const SAME_GAP_TENTHS = 0.5;

function TypeComparison({ rows, t }: { rows: readonly SessionTypeComparison[]; t: TFunction }) {
  const lines: { key: string; label: string; value: (side: SessionTypeSide) => string }[] = [
    { key: 'sessions', label: t('stats.sessions'), value: (s) => String(s.sessionCount) },
    { key: 'mean', label: t('stats.statsSeriesMean'), value: (s) => score(s.meanSeriesTenths) },
    {
      key: 'median',
      label: t('stats.typeComparisonMedian'),
      value: (s) => score(s.medianSeriesTenths),
    },
    {
      key: 'best',
      label: t('stats.typeComparisonBest'),
      value: (s) => formatTotalScore(s.bestSeriesTenths),
    },
    { key: 'sd', label: t('stats.statsSeriesSd'), value: (s) => score(s.seriesSdTenths, 2) },
    {
      key: 'x',
      label: t('stats.statsSeriesInnerTens'),
      value: (s) => (s.innerTensPerSeries === null ? DASH : s.innerTensPerSeries.toFixed(1)),
    },
  ];
  const gap = (tenths: number) => {
    if (Math.abs(tenths) < SAME_GAP_TENTHS) return t('stats.typeComparisonGapSame');
    const points = score(Math.abs(tenths));
    return tenths < 0
      ? t('stats.typeComparisonGapBelow', { points })
      : t('stats.typeComparisonGapAbove', { points });
  };

  return (
    <Card title={t('stats.typeComparisonTitle')} wide>
      <p className="muted">{t('stats.typeComparisonHint')}</p>
      <div className="comparisons">
        {rows.map((row) => (
          <table key={`${row.disciplineId}-${row.seriesLength}`}>
            <caption>
              {t('stats.typeComparisonGroup', {
                discipline: disciplineLabel(t, row.disciplineId),
                count: row.seriesLength,
              })}
            </caption>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">{t('web.statsMeasure')}</span>
                </th>
                <th>{t('sessionType.training')}</th>
                <th>{t('sessionType.competition')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <th className="muted">{line.label}</th>
                  <td>{line.value(row.training)}</td>
                  <td>{line.value(row.competition)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{gap(row.gapSeriesTenths)}</td>
              </tr>
            </tfoot>
          </table>
        ))}
      </div>
    </Card>
  );
}

function SighterRelations({ entries, t }: { entries: readonly SighterRelation[]; t: TFunction }) {
  const verdict = (entry: SighterRelation) => {
    if (entry.correlation === null) {
      return entry.neededMore > 0
        ? t('stats.sighterRelationNeedsMore', { count: entry.neededMore })
        : t('stats.sighterRelationNoVariance', { count: entry.competitionCount });
    }
    const { r, strength, direction } = entry.correlation;
    const values = { r: r.toFixed(2), count: entry.competitionCount };
    if (direction === null) return t('stats.sighterRelationNone', values);
    const word = t(`stats.sighterStrength.${strength as Exclude<typeof strength, 'none'>}`);
    return direction === 'positive'
      ? t('stats.sighterRelationPositive', { ...values, strength: word })
      : t('stats.sighterRelationNegative', { ...values, strength: word });
  };

  return (
    <Card title={t('stats.sighterRelationTitle')} wide>
      <div className="comparisons">
        {entries.map((entry) => (
          <div key={entry.disciplineId}>
            <h3>{disciplineLabel(t, entry.disciplineId)}</h3>
            <ScatterPlot
              label={`${t('stats.sighterRelationTitle')}: ${disciplineLabel(t, entry.disciplineId)}`}
              points={entry.points.map((p) => ({
                key: p.sessionId,
                x: p.sighterMeanShotTenths,
                y: p.resultMeanShotTenths,
              }))}
              xLabel={t('stats.sighterRelationX')}
              yLabel={t('stats.sighterRelationY')}
              formatValue={(tenths) => score(tenths)}
            />
            <p>{verdict(entry)}</p>
          </div>
        ))}
      </div>
      <p className="muted">{t('stats.sighterRelationCaveat')}</p>
    </Card>
  );
}
