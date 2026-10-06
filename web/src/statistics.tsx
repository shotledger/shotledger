// The Statistics report on a wide screen: the phone's filter form as a
// sidebar, applied live, and the report's sections in a grid. Every number
// comes from composeAnalyticsReport, the function the phone uses.
import {
  DEFAULT_ANALYTICS_FILTER,
  buildFilterOptions,
  composeAnalyticsReport,
  periodRange,
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
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CHART_LINE_COLORS,
  groupByDiscipline,
  type DisciplinePoint,
} from '../../app/src/components/time-series-chart-math';
import { disciplineLabel } from '../../app/src/features/session/labels';
import type { PulledTables } from './pull';
import { BarChart, LineChart, ScatterPlot } from './report/charts';
import { Filters } from './report/filters';
import { statsInputs } from './stats-inputs';

const DASH = '–';
const score = (tenths: number | null, digits = 1) =>
  tenths === null ? DASH : tenthsToScore(tenths).toFixed(digits);

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label muted">{label}</span>
    </div>
  );
}

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={wide ? 'card wide' : 'card'}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function Statistics({ tables }: { tables: PulledTables }) {
  const { t, i18n } = useTranslation();
  const inputs = useMemo(() => statsInputs(tables), [tables]);
  const options = useMemo(() => buildFilterOptions(inputs), [inputs]);
  const [filter, setFilter] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTER);
  // Settings are not synced, so the age-reduced guldserie threshold cannot be
  // known here; the tile stays off rather than counting on the wrong bar.
  const data = useMemo(
    () => composeAnalyticsReport(filter, { ...inputs, birthYear: null }),
    [filter, inputs],
  );

  if (!options.hasAnyData) {
    return (
      <section className="card">
        <h2>{t('stats.emptyTitle')}</h2>
        <p className="muted">{t('stats.emptyBody')}</p>
      </section>
    );
  }

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
  const formatShortDate = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(new Date(iso));
  const colors = CHART_LINE_COLORS[prefersDark() ? 'dark' : 'light'];
  const label = (id: string) => disciplineLabel(t, id);
  const range = periodRange(filter);
  const chart: ChartRenderer = (points, pick, formatValue) => {
    const grouped = groupByDiscipline(points, pick, label, colors);
    return (
      <LineChart
        grouped={grouped}
        formatValue={formatValue}
        formatDate={formatShortDate}
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
    <div className="stats-layout">
      <Filters state={filter} options={options} onChange={setFilter} />
      <div className="report">
        <p className="match-count">
          {t('stats.matchCount', { count: data.totals.sessionCount })}
          {range.fromIso && (
            <span className="muted">
              {' · '}
              {formatDate(range.fromIso)} –{' '}
              {range.toIso ? formatDate(range.toIso) : t('compliance.pdfNow')}
            </span>
          )}
        </p>
        {!data.hasMatches ? (
          <section className="card">
            <h2>{t('stats.emptyFilteredTitle')}</h2>
            <p className="muted">{t('stats.emptyFilteredBody')}</p>
          </section>
        ) : (
          <Sections data={data} t={t} formatDate={formatDate} chart={chart} />
        )}
      </div>
    </div>
  );
}

type ChartRenderer = <P extends DisciplinePoint>(
  points: readonly P[],
  pick: (point: P) => number | null,
  formatValue: (value: number) => string,
) => ReactNode;

function Sections({
  data,
  t,
  formatDate,
  chart,
}: {
  data: AnalyticsReportData;
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
          <span className="muted">
            {entry.sessionName} · {formatDate(entry.startedAt)}
          </span>
        </span>
        <strong>{value}</strong>
      </div>
    );
  const totals = data.totals;

  return (
    <div className="grid">
      <Card title={t('stats.sumTitle')}>
        <div className="tiles">
          <Tile label={t('stats.totalShots')} value={String(totals.volumeShotCount)} />
          <Tile label={t('stats.sessions')} value={String(totals.sessionCount)} />
          {data.showRingCards && (
            <>
              <Tile label={t('stats.totalScore')} value={score(totals.sumTenths)} />
              <Tile label={t('stats.seriesCount')} value={String(totals.scoredSeriesCount)} />
              <Tile label={t('stats.innerTens')} value={String(totals.innerTenCount)} />
              <Tile label={t('stats.tens')} value={String(totals.tenCount)} />
            </>
          )}
        </div>
      </Card>

      {data.showRingCards && (
        <Card title={t('stats.perShotTitle')}>
          <div className="tiles">
            <Tile label={t('stats.mean')} value={score(totals.meanShotTenths)} />
            <Tile label={t('stats.meanPerSeries')} value={score(totals.meanSeriesTenths)} />
            <Tile label={t('stats.standardDeviation')} value={score(data.sdTenths, 2)} />
            <Tile
              label={t('stats.xPercent')}
              value={
                totals.scoredShotCount === 0
                  ? DASH
                  : `${((totals.innerTenCount / totals.scoredShotCount) * 100).toFixed(0)}%`
              }
            />
          </div>
        </Card>
      )}

      {data.showRingCards && (
        <Card title={t('stats.summaryTitle')}>
          {record(
            t('stats.recordSessionScore'),
            data.bestSessionScore,
            score(data.bestSessionScore?.value ?? null),
          )}
          {record(
            t('stats.recordInnerTens'),
            data.mostInnerTens,
            String(data.mostInnerTens?.value ?? DASH),
          )}
          {record(t('stats.recordTens'), data.mostTens, String(data.mostTens?.value ?? DASH))}
        </Card>
      )}

      {data.falt && (
        <Card title={disciplineLabel(t, 'spsf-falt')}>
          <div className="tiles">
            <Tile label={t('stats.faltStations')} value={String(data.falt.totals.stationCount)} />
            <Tile
              label={t('stats.faltHitRate')}
              value={
                data.falt.totals.hitRate === null
                  ? DASH
                  : `${(data.falt.totals.hitRate * 100).toFixed(0)}%`
              }
            />
            <Tile label={t('stats.faltHits')} value={String(data.falt.totals.hits)} />
            <Tile label={t('stats.faltFiguresHit')} value={String(data.falt.totals.figuresHit)} />
          </div>
          <h3>{t('stats.chartFaltHitsPerStation')}</h3>
          {chart(
            data.falt.points,
            (p) => p.hitsPerStation,
            (v) => v.toFixed(1),
          )}
        </Card>
      )}

      {data.showRingCards && (
        <>
          <Card title={t('stats.chartSessionScore')} wide>
            {chart(
              data.points,
              (p) => (p.scoredSeriesCount === 0 ? null : p.sessionTotalTenths),
              (v) => score(v, 0),
            )}
          </Card>
          <Card title={t('stats.chartSeriesMean')}>
            {chart(
              data.points,
              (p) => p.meanSeriesTotalTenths,
              (v) => score(v, 0),
            )}
          </Card>
          <Card title={t('stats.chartShotMean')}>
            {chart(
              data.points,
              (p) => p.meanShotTenths,
              (v) => score(v),
            )}
          </Card>
          <Card title={t('stats.distributionTitle')}>
            {data.distribution.length === 0 ? (
              <p className="muted">{t('stats.distributionEmpty')}</p>
            ) : (
              <BarChart buckets={data.distribution} />
            )}
          </Card>
          {data.typeComparison.length > 0 && <TypeComparison rows={data.typeComparison} t={t} />}
          {data.sighterRelation.length > 0 && (
            <SighterRelations entries={data.sighterRelation} t={t} />
          )}
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
    { key: 'best', label: t('stats.typeComparisonBest'), value: (s) => score(s.bestSeriesTenths) },
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
                <th />
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
