// Session detail (§4 M3): the series list with per-shot chips and per-series
// totals, the derived Before final / Final / Total results (§6.3), the
// guldserie badge (§6.5), and the controls that grow the session — add
// series, start final. Swipe a series row left to delete it (§4 fix batch,
// 2026-09-03).
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { formatGroupAndClass, tenthsToScore } from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DistributionBarChart } from '@/components/distribution-bar-chart';
import { EmptyState } from '@/components/empty-state';
import { GroupPlot } from '@/components/group-plot';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ShotChips } from '@/components/shot-chips';
import { StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { deleteSeriesAndShots, setSessionExtraRounds } from '@/db/queries/round-count';
import { addSeries } from '@/db/queries/series';
import { useSessionDetail, type SeriesRow } from '@/features/session/use-session-detail';
import { useSessionGroup } from '@/features/photo-scoring/use-session-group';
import { useSessionStats } from '@/features/session/use-session-stats';
import { WebShooterSessionBadge } from '@/features/webshooter/components/session-badge';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

type DetailView = 'series' | 'stats' | 'group';

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, refresh } = useSessionDetail(id);
  const stats = useSessionStats(id);
  const group = useSessionGroup(id);
  const [nextIsFinal, setNextIsFinal] = useState(false);
  const [view, setView] = useState<DetailView>('series');

  const { session, seriesRows, results } = detail;
  const [extraRounds, setExtraRounds] = useState<string>(
    session?.extraRounds == null ? '' : String(session.extraRounds),
  );

  if (!session) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('session.detailTitle')}</ThemedText>
      </Screen>
    );
  }

  function openSeries(position: number) {
    router.push(`/session/${id}/series/${position}`);
  }

  function onAddSeries() {
    if (!db) return;
    const position = seriesRows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
    addSeries(db, {
      sessionId: id,
      position,
      isFinal: nextIsFinal,
    });
    refresh();
    openSeries(position);
  }

  /**
   * Unscored extra rounds (spec A1 §A1.3). Saved on blur so the firearm round
   * counter moves once per edit, by the delta, rather than on every keystroke.
   */
  function onCommitExtraRounds() {
    if (!db) return;
    const trimmed = extraRounds.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
      setExtraRounds(session?.extraRounds == null ? '' : String(session.extraRounds));
      return;
    }
    setSessionExtraRounds(db, id, parsed);
    refresh();
  }

  function onStartFinal() {
    setNextIsFinal(true);
  }

  function onDeleteSeries(row: SeriesRow) {
    Alert.alert(
      t('session.deleteSeriesConfirmTitle', { position: row.position }),
      t('session.deleteSeriesConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('session.deleteSeries'),
          style: 'destructive',
          onPress: () => {
            if (!db) return;
            deleteSeriesAndShots(db, row.id);
            refresh();
          },
        },
      ],
    );
  }

  const mainRows = seriesRows.filter((row) => !row.isFinal);
  const finalRows = seriesRows.filter((row) => row.isFinal);

  const renderSeries = (row: SeriesRow) => {
    const content = (
      <Pressable
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

    // A fixed-format program pre-creates its series to match the match
    // structure (§6.3) — removing one would leave that structure incomplete,
    // so swipe-to-delete is offered only for freely-added series.
    if (detail.isFixedFormat) {
      return (
        <View key={row.id} style={styles.seriesWrapper}>
          {content}
        </View>
      );
    }

    return (
      <Swipeable
        key={row.id}
        containerStyle={styles.seriesWrapper}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            accessibilityRole="button"
            testID={`series-${row.position}-delete`}
            onPress={() => onDeleteSeries(row)}
            style={[styles.deleteAction, { backgroundColor: theme.danger }]}
          >
            <ThemedText type="smallBold" themeColor="onPrimary">
              {t('session.deleteSeries')}
            </ThemedText>
          </Pressable>
        )}
      >
        {content}
      </Swipeable>
    );
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              testID="edit-session"
              hitSlop={8}
              onPress={() => router.push(`/session/${id}/edit`)}
            >
              <ThemedText type="linkPrimary">{t('common.edit')}</ThemedText>
            </Pressable>
          ),
        }}
      />

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

      <WebShooterSessionBadge session={session} />

      <Card style={styles.metricCard}>
        <View style={styles.metricRow}>
          {results.hasFinal && (
            <>
              <MetricTile
                label={t('session.beforeFinal')}
                value={String(tenthsToScore(results.beforeFinalTenths))}
                testID="result-before-final"
              />
              <MetricTile
                label={t('session.final')}
                value={String(tenthsToScore(results.finalTenths))}
                testID="result-final"
              />
            </>
          )}
          <MetricTile
            label={t('session.total')}
            value={String(tenthsToScore(results.totalTenths))}
            testID="session-total"
          />
          <MetricTile
            label={t('session.seriesAverage')}
            value={
              detail.seriesAverageTenths === null
                ? '–'
                : tenthsToScore(detail.seriesAverageTenths).toFixed(1)
            }
            testID="session-series-average"
          />
          <MetricTile
            label={t('session.innerTenCount')}
            value={String(detail.innerTenCount)}
            testID="session-inner-ten-count"
          />
        </View>
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('session.extraRounds')}</ThemedText>
        <TextField
          value={extraRounds}
          onChangeText={setExtraRounds}
          onBlur={onCommitExtraRounds}
          onSubmitEditing={onCommitExtraRounds}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          testID="extra-rounds"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.extraRoundsHint')}
        </ThemedText>
      </Card>

      {seriesRows.length > 0 && (
        <SegmentedControl
          testID="detail-view-toggle"
          options={[
            { value: 'series', label: t('stats.toggleSeries') },
            { value: 'stats', label: t('stats.toggleStats') },
            // The Group view exists only where marks do — no empty chrome for
            // the sessions that predate photo scoring.
            ...(group ? [{ value: 'group' as const, label: t('photoScoring.groupTitle') }] : []),
          ]}
          value={view}
          onChange={setView}
        />
      )}

      {view === 'group' && group && (
        <Card testID="session-group-view">
          <View style={styles.groupPlot}>
            <GroupPlot
              target={group.target}
              shots={group.marks.map((m) => ({
                xMm: m.xMm,
                yMm: m.yMm,
                caliberMm: m.caliberMm,
              }))}
              size={300}
            />
          </View>
          <View style={styles.resultsRow}>
            <StatTile
              testID="group-stat-windage"
              label={t('photoScoring.windage')}
              value={t('photoScoring.millimetres', {
                value: group.analysis.windageMm.toFixed(1),
              })}
            />
            <StatTile
              testID="group-stat-elevation"
              label={t('photoScoring.elevation')}
              value={t('photoScoring.millimetres', {
                value: group.analysis.elevationMm.toFixed(1),
              })}
            />
          </View>
          <View style={styles.resultsRow}>
            <StatTile
              testID="group-stat-mean-radius"
              label={t('photoScoring.meanRadius')}
              value={t('photoScoring.millimetres', {
                value: group.analysis.meanRadiusMm.toFixed(1),
              })}
            />
            <StatTile
              testID="group-stat-max-spread"
              label={t('photoScoring.maxSpread')}
              value={t('photoScoring.millimetres', {
                value: group.analysis.extremeSpreadMm.toFixed(1),
              })}
            />
          </View>
          <ThemedText type="smallBold">{t('photoScoring.pointsLostTitle')}</ThemedText>
          <View style={styles.resultsRow}>
            <StatTile
              testID="group-stat-potential-score"
              label={t('photoScoring.potentialScore')}
              value={String(group.pointsLost.recenteredScore)}
            />
            <StatTile
              testID="group-stat-points-lost-position"
              label={t('photoScoring.pointsLostPosition')}
              // Can be negative (a called flier drags the MPI away from an
              // otherwise-tight cluster — spec §9.1) — clamp the display at
              // 0 rather than showing a shooter a negative "points lost".
              value={String(Math.max(0, group.pointsLost.pointsLostToPosition))}
            />
            <StatTile
              testID="group-stat-points-lost-size"
              label={t('photoScoring.pointsLostSize')}
              value={String(group.pointsLost.pointsLostToSize)}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('photoScoring.shotsMarked', { count: group.analysis.shotCount })}
          </ThemedText>
          {stats.distribution.length > 0 && <DistributionBarChart buckets={stats.distribution} />}
        </Card>
      )}

      {view === 'stats' && seriesRows.length > 0 ? (
        <Card testID="session-stats-view">
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('stats.statsPerShotTitle')}
          </ThemedText>
          <View style={styles.metricRow}>
            <MetricTile
              testID="session-stat-mean"
              label={t('stats.statsMean')}
              value={stats.meanTenths === null ? '–' : tenthsToScore(stats.meanTenths).toFixed(1)}
            />
            <MetricTile
              testID="session-stat-sd"
              label={t('stats.statsSd')}
              value={stats.sdTenths === null ? '–' : tenthsToScore(stats.sdTenths).toFixed(2)}
            />
            <MetricTile
              testID="session-stat-x-count"
              label={t('stats.statsXCount')}
              value={String(stats.xCount)}
            />
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('stats.statsSumTitle')}
          </ThemedText>
          <View style={styles.metricRow}>
            <MetricTile
              testID="session-stat-total-points"
              label={t('stats.statsTotalPoints')}
              value={String(tenthsToScore(stats.sumTenths))}
            />
            <MetricTile
              testID="session-stat-total-shots"
              label={t('stats.statsTotalShots')}
              value={String(stats.shotCount)}
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
                <StatTile
                  testID="comparison-recent"
                  label={t('stats.comparisonRecent')}
                  value={tenthsToScore(stats.comparison.recentMeanTenths ?? 0).toFixed(2)}
                />
                <StatTile
                  testID="comparison-previous"
                  label={t('stats.comparisonPrevious')}
                  value={tenthsToScore(stats.comparison.previousMeanTenths).toFixed(2)}
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
              <PrimaryButton
                label={t('session.addSeries')}
                onPress={onAddSeries}
                testID="add-series"
              />
              {detail.canStartFinal && !nextIsFinal && (
                <PrimaryButton
                  label={t('session.startFinal')}
                  onPress={onStartFinal}
                  testID="start-final"
                />
              )}
            </Card>
          )}

          {seriesRows.length > 0 && (
            <Card>
              <PrimaryButton
                label={t('photoScoring.scanTarget')}
                onPress={() =>
                  router.push(
                    `/session/${id}/scan?pos=${seriesRows[seriesRows.length - 1]?.position ?? 1}`,
                  )
                }
                testID="scan-target"
              />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * A compact labeled number — the results card and the per-shot/sum stat
 * rows. Deliberately lighter than `StatTile` (no nested Card padding, single-
 * line ellipsized label) so 3-5 of these fit one row at phone widths without
 * a long Swedish label ("Standardavvikelse") wrapping character-by-character.
 */
function MetricTile({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.metricTile}>
      <ThemedText type="smallBold" numberOfLines={1} testID={testID}>
        {value}
      </ThemedText>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        numberOfLines={1}
        ellipsizeMode="tail"
        style={styles.metricLabel}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  groupPlot: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  resultsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricCard: {
    paddingVertical: Spacing.two,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 64,
    minWidth: 0,
    gap: Spacing.half,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  seriesWrapper: {
    // Swipeable measures its own children — keep the row's own vertical
    // rhythm here instead of on the Pressable so the swiped-open action
    // aligns with the row rather than any surrounding gap.
    paddingVertical: Spacing.one,
  },
  seriesRow: {
    gap: Spacing.two,
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
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
  },
  pressed: {
    opacity: 0.6,
  },
});
