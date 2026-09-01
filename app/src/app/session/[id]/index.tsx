// Session detail (§4 M3): the series list with per-shot chips and per-series
// totals, the derived Before final / Final / Total results (§6.3), the
// guldserie badge (§6.5), and the controls that grow the session — add
// series, sighter toggle, start final.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { formatGroupAndClass, tenthsToScore } from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ShotChips } from '@/components/shot-chips';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { addSeries } from '@/db/queries/series';
import { useSessionDetail, type SeriesRow } from '@/features/session/use-session-detail';
import { useSessionStats } from '@/features/session/use-session-stats';
import { Spacing } from '@/theme/tokens';

type DetailView = 'series' | 'stats';

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, refresh } = useSessionDetail(id);
  const stats = useSessionStats(id);
  const [nextIsSighter, setNextIsSighter] = useState(false);
  const [nextIsFinal, setNextIsFinal] = useState(false);
  const [view, setView] = useState<DetailView>('series');

  const { session, seriesRows, results, mainHasSighter, finalHasSighter } = detail;

  if (!session) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('session.detailTitle')}</ThemedText>
      </Screen>
    );
  }

  const sighterDisabled = nextIsFinal ? finalHasSighter : mainHasSighter;

  function openSeries(position: number) {
    router.push(`/session/${id}/series/${position}`);
  }

  function onAddSeries() {
    if (!db) return;
    const position = seriesRows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
    addSeries(db, {
      sessionId: id,
      position,
      isSighter: nextIsSighter && !sighterDisabled,
      isFinal: nextIsFinal,
    });
    setNextIsSighter(false);
    refresh();
    openSeries(position);
  }

  function onStartFinal() {
    setNextIsFinal(true);
    setNextIsSighter(false);
  }

  const mainRows = seriesRows.filter((row) => !row.isFinal);
  const finalRows = seriesRows.filter((row) => row.isFinal);

  const renderSeries = (row: SeriesRow) => (
    <Pressable
      key={row.id}
      accessibilityRole="button"
      testID={`series-${row.position}`}
      onPress={() => openSeries(row.position)}
      style={({ pressed }) => [styles.seriesRow, pressed && styles.pressed]}
    >
      <View style={styles.seriesHeader}>
        <ThemedText type="smallBold">
          {t('session.seriesTitle', { position: row.position })}
        </ThemedText>
        <View style={styles.badges}>
          {row.isSighter && <Chip label={t('session.sighter')} />}
          {row.timeLimitSeconds !== null && (
            <Chip label={t('session.timeLimit', { seconds: row.timeLimitSeconds })} />
          )}
          {row.photoUri && <Chip label={t('session.photoAdded')} />}
          {row.isGuldserie && <Chip label={t('session.guldserie')} tone="primary" />}
          <ThemedText type="smallBold">
            {row.isSighter ? '–' : tenthsToScore(row.totalTenths)}
          </ThemedText>
        </View>
      </View>
      <ShotChips
        shots={row.shots}
        mode={detail.scoringMode}
        testIDPrefix={`s${row.position}-shot`}
      />
    </Pressable>
  );

  return (
    <Screen>
      <View>
        <ThemedText type="subtitle" style={styles.title}>
          {session.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[
            t(`sessionType.${session.type}`),
            formatGroupAndClass(session.weaponGroup, session.shooterClass),
            session.competitionName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>

      <Card>
        {results.hasFinal ? (
          <View style={styles.resultsRow}>
            <ResultCell
              label={t('session.beforeFinal')}
              tenths={results.beforeFinalTenths}
              testID="result-before-final"
            />
            <ResultCell
              label={t('session.final')}
              tenths={results.finalTenths}
              testID="result-final"
            />
            <ResultCell
              label={t('session.total')}
              tenths={results.totalTenths}
              testID="session-total"
            />
          </View>
        ) : (
          <ResultCell
            label={t('session.total')}
            tenths={results.totalTenths}
            testID="session-total"
          />
        )}
        {seriesRows[0]?.guldThreshold != null && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.guldAt', { points: seriesRows[0].guldThreshold })}
          </ThemedText>
        )}
      </Card>

      {seriesRows.length > 0 && (
        <SegmentedControl
          testID="detail-view-toggle"
          options={[
            { value: 'series', label: t('stats.toggleSeries') },
            { value: 'stats', label: t('stats.toggleStats') },
          ]}
          value={view}
          onChange={setView}
        />
      )}

      {view === 'stats' && seriesRows.length > 0 ? (
        <Card testID="session-stats-view">
          <View style={styles.resultsRow}>
            <StatTile
              testID="session-stat-mean"
              label={t('stats.statsMean')}
              value={stats.meanTenths === null ? '–' : tenthsToScore(stats.meanTenths).toFixed(1)}
            />
            <StatTile
              testID="session-stat-sd"
              label={t('stats.statsSd')}
              value={stats.sdTenths === null ? '–' : tenthsToScore(stats.sdTenths).toFixed(2)}
            />
            <StatTile
              testID="session-stat-x-count"
              label={t('stats.statsXCount')}
              value={String(stats.xCount)}
            />
          </View>

          {stats.distribution.length > 0 && (
            <View>
              <ThemedText type="smallBold">{t('stats.distributionTitle')}</ThemedText>
              <DistributionBarChart buckets={stats.distribution} height={100} />
            </View>
          )}

          <View>
            <ThemedText type="smallBold">{t('stats.comparisonTitle')}</ThemedText>
            {stats.comparison?.previousMeanTenths == null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('stats.comparisonNotEnough')}
              </ThemedText>
            ) : (
              <View style={styles.resultsRow}>
                <ResultCell
                  label={t('stats.comparisonRecent')}
                  tenths={stats.comparison.recentMeanTenths ?? 0}
                  testID="comparison-recent"
                />
                <ResultCell
                  label={t('stats.comparisonPrevious')}
                  tenths={stats.comparison.previousMeanTenths}
                  testID="comparison-previous"
                />
              </View>
            )}
          </View>

          {stats.standardmedalj && (
            <ThemedText type="small" themeColor="textSecondary" testID="standardmedalj-line">
              {t(
                stats.standardmedalj.valor === 'silver'
                  ? 'stats.standardmedaljSilver'
                  : 'stats.standardmedaljBrons',
              )}
            </ThemedText>
          )}
        </Card>
      ) : (
        <>
          {seriesRows.length === 0 ? (
            <EmptyState title={t('session.noSeries')} body={t('session.noSeriesBody')} />
          ) : (
            <Card>
              {mainRows.length > 0 && finalRows.length > 0 && (
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('session.mainSection')}
                </ThemedText>
              )}
              {mainRows.map(renderSeries)}
              {finalRows.length > 0 && (
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('session.finalSection')}
                </ThemedText>
              )}
              {finalRows.map(renderSeries)}
            </Card>
          )}

          {!detail.isFixedFormat && (
            <Card>
              <View style={styles.switchRow}>
                <ThemedText type="small" themeColor={sighterDisabled ? 'textSecondary' : 'text'}>
                  {sighterDisabled ? t('session.sighterUsed') : t('session.sighter')}
                </ThemedText>
                <Switch
                  value={nextIsSighter && !sighterDisabled}
                  disabled={sighterDisabled}
                  onValueChange={setNextIsSighter}
                  testID="sighter-toggle"
                />
              </View>
              <PrimaryButton label={t('session.addSeries')} onPress={onAddSeries} testID="add-series" />
              {detail.canStartFinal && !nextIsFinal && (
                <PrimaryButton
                  label={t('session.startFinal')}
                  onPress={onStartFinal}
                  testID="start-final"
                />
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function ResultCell({ label, tenths, testID }: { label: string; tenths: number; testID: string }) {
  return (
    <View style={styles.resultCell}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" testID={testID}>
        {tenthsToScore(tenths)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  resultsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  resultCell: {
    gap: Spacing.half,
  },
  seriesRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
});
