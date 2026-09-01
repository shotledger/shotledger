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
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ShotChips } from '@/components/shot-chips';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { addSeries } from '@/db/queries/series';
import { useSessionDetail, type SeriesRow } from '@/features/session/use-session-detail';
import { Spacing } from '@/theme/tokens';

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, refresh } = useSessionDetail(id);
  const [nextIsSighter, setNextIsSighter] = useState(false);
  const [nextIsFinal, setNextIsFinal] = useState(false);

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
