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
import { TagChips } from '@/components/tag-chips';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { deleteSeriesAndShots, setSessionExtraRounds } from '@/db/queries/round-count';
import { useSessionDetail, type SeriesRow } from '@/features/session/use-session-detail';
import { useSessionGroup } from '@/features/photo-scoring/use-session-group';
import { SessionMenu } from '@/features/session/session-menu';
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

  const { session, seriesRows, results, tags } = detail;
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

  /**
   * Adding a series only navigates — the row is written by the entry screen's
   * Save. Creating it here left an orphaned "Series N · 0" behind whenever
   * the user backed out with the hardware back button (maintainer, verified
   * live 2026-09-03).
   */
  function onAddSeries() {
    const position = seriesRows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
    router.push(`/session/${id}/series/${position}?new=1${nextIsFinal ? '&final=1' : ''}`);
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

  // `sessions.kind` is chosen at creation and immutable (§3): a 'rounds'
  // session logs a fired-shot count and never gets series, a 'series'
  // session is the reverse. Show only the controls that belong to the kind
  // rather than offering both (maintainer, 2026-09-03: "It's either or and
  // determined when the session is created"). Gating only — a legacy row's
  // stored extra_rounds and series are left untouched either way.
  const isRoundsSession = session.kind === 'rounds';

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
          headerRight: () => <SessionMenu sessionId={id} sightsFirearmId={session.firearmId} />,
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
        <TagChips names={tags} testID="session-tags" />
      </View>

      <WebShooterSessionBadge session={session} />

      <Card style={styles.metricCard}>
        {metricRows([
          ...(results.hasFinal
            ? [
                {
                  label: t('session.beforeFinal'),
                  value: String(tenthsToScore(results.beforeFinalTenths)),
                  testID: 'result-before-final',
                },
                {
                  label: t('session.final'),
                  value: String(tenthsToScore(results.finalTenths)),
                  testID: 'result-final',
                },
              ]
            : []),
          {
            label: t('session.total'),
            value: String(tenthsToScore(results.totalTenths)),
            testID: 'session-total',
          },
          {
            label: t('session.seriesAverage'),
            value:
              detail.seriesAverageTenths === null
                ? '\u2013'
                : tenthsToScore(detail.seriesAverageTenths).toFixed(1),
            testID: 'session-series-average',
          },
          {
            label: t('session.innerTenCount'),
            value: String(detail.innerTenCount),
            testID: 'session-inner-ten-count',
          },
          {
            label: t('session.innerTenAverage'),
            value: detail.innerTenAverage === null ? '\u2013' : detail.innerTenAverage.toFixed(1),
            testID: 'session-inner-ten-average',
          },
        ]).map((row, index) => (
          <View key={index} style={styles.metricRow}>
            {row.map((tile) => (
              <MetricTile key={tile.testID} {...tile} />
            ))}
          </View>
        ))}
      </Card>

      {isRoundsSession && (
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
      )}

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
            {t('stats.statsPerSeriesTitle')}
          </ThemedText>
          <View style={styles.metricRow}>
            <MetricTile
              testID="session-stat-series-mean"
              label={t('stats.statsSeriesMean')}
              value={
                stats.seriesMeanTenths === null
                  ? '–'
                  : tenthsToScore(stats.seriesMeanTenths).toFixed(2)
              }
            />
            <MetricTile
              testID="session-stat-series-sd"
              label={t('stats.statsSeriesSd')}
              value={
                stats.seriesSdTenths === null ? '–' : tenthsToScore(stats.seriesSdTenths).toFixed(2)
              }
            />
            <MetricTile
              testID="session-stat-series-inner-tens"
              label={t('stats.statsSeriesInnerTens')}
              value={
                stats.seriesInnerTenAverage === null ? '–' : stats.seriesInnerTenAverage.toFixed(1)
              }
            />
            <MetricTile
              testID="session-stat-series-count"
              label={t('stats.statsSeriesCount')}
              value={String(stats.seriesCount)}
            />
          </View>

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

          {/* No "Whole Session" block: its Total Points was the result card's
              `session-total` by a second code path, and its Total Shots is the
              count now in the distribution heading below (maintainer, third
              review, both called redundant). */}
          {stats.distribution.length > 0 && (
            <View>
              <ThemedText type="smallBold">
                {t('stats.distributionTitleWithCount', { count: stats.shotCount })}
              </ThemedText>
              <DistributionBarChart buckets={stats.distribution} height={100} />
            </View>
          )}

          <View>
            <ThemedText type="smallBold">{t('stats.comparisonTitle')}</ThemedText>
            {stats.comparison?.previousSeriesMeanTenths == null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('stats.comparisonNotEnough')}
              </ThemedText>
            ) : (
              <>
                <View style={styles.resultsRow}>
                  <StatTile
                    testID="comparison-recent"
                    label={t('stats.comparisonRecent')}
                    value={tenthsToScore(stats.comparison.recentSeriesMeanTenths ?? 0).toFixed(2)}
                  />
                  <StatTile
                    testID="comparison-previous"
                    label={t('stats.comparisonPrevious')}
                    value={tenthsToScore(stats.comparison.previousSeriesMeanTenths).toFixed(2)}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('stats.comparisonHint')}
                </ThemedText>
              </>
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
            isRoundsSession ? null : (
              <EmptyState title={t('session.noSeries')} body={t('session.noSeriesBody')} />
            )
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

          {!detail.isFixedFormat && !isRoundsSession && (
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

          {!isRoundsSession && seriesRows.length > 0 && (
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
 * Rows for the results card. Four tiles fit one line down to a 320 dp phone,
 * but a session with a final carries six, which do not — laying those out as
 * a balanced 3 + 3 beats the ragged 5 + 1 that `flexWrap` produces on its own
 * (found on device, third review).
 */
function metricRows<T>(tiles: readonly T[]): T[][] {
  if (tiles.length <= 4) return [[...tiles]];
  const rows: T[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  return rows;
}

/**
 * A compact labeled number — the results card and the per-shot/sum stat
 * rows. Deliberately lighter than `StatTile` (no nested Card padding, single-
 * line label) so 4-6 of these fit one row at phone widths without a long
 * Swedish label ("Standardavvikelse") wrapping character-by-character. The
 * label shrinks to fit rather than ellipsizing, the same treatment `StatTile`
 * got in #76 — at four tiles a row "X (Inner Tens)" would otherwise clip to
 * "X (Inne…".
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
        adjustsFontSizeToFit
        minimumFontScale={0.8}
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
    // The results card carries four tiles since the third review. Screen and
    // Card padding eat 64 dp, so a 320 dp phone leaves 256: at the previous
    // gap/basis (16/64) four tiles need 304 and wrap 3 + 1, making the card
    // TALLER — the opposite of the "much smaller" backlog §1 asks for. 8/56
    // needs 248 and stays on one line; flexGrow still spreads them to fill.
    gap: Spacing.two,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 56,
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
