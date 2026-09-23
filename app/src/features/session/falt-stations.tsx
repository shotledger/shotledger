// The station list and result for a fält session (#315). A ring session's
// metric tiles have nothing to show here: a fält result is two numbers, or one
// sum in poängfält, and neither is a point total.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { faltSessionResult, listStationsForSession } from '@/db/queries/falt';
import { Spacing } from '@/theme/tokens';

const EMPTY_RESULT = {
  stationCount: 0,
  hits: 0,
  figuresHit: 0,
  ringedFigurePoints: null,
  poangfaltPoints: 0,
  pointsMax: null,
};

function load(sessionId: string) {
  if (!db) return { stations: [], result: EMPTY_RESULT };
  return {
    stations: listStationsForSession(db, sessionId),
    result: faltSessionResult(db, sessionId),
  };
}

/** The detail screen's MetricTile is local to that file; this is its twin. */
function Tile({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" testID={testID}>
        {value}
      </ThemedText>
    </View>
  );
}

export interface FaltStationsProps {
  sessionId: string;
  /** 'poangfalt' presents the result as one sum (D.6.11 p. 95). */
  resultMode: 'falt' | 'poangfalt';
}

export function FaltStations({ sessionId, resultMode }: FaltStationsProps) {
  const { t } = useTranslation();
  const router = useRouter();

  // Refetch on focus, like Home and the session detail: returning from the
  // station screen must show what was just entered. Reading at render time
  // alone showed a stale list until the app was restarted (found on the
  // emulator, #315).
  const [data, setData] = useState(() => load(sessionId));
  useFocusEffect(
    useCallback(() => {
      setData(load(sessionId));
    }, [sessionId]),
  );
  const { stations, result } = data;

  const nextPosition = (stations[stations.length - 1]?.position ?? 0) + 1;

  return (
    <>
      <Card style={styles.metricCard}>
        <View style={styles.metricRow}>
          <Tile
            testID="falt-result"
            label={t('session.total')}
            value={
              resultMode === 'poangfalt'
                ? t('session.poangfaltTotal', { points: result.poangfaltPoints })
                : t('session.faltTotal', { hits: result.hits, figures: result.figuresHit })
            }
          />
          <Tile
            testID="falt-station-count"
            label={t('session.stations')}
            value={String(result.stationCount)}
          />
          {result.ringedFigurePoints !== null && (
            <Tile
              testID="falt-poang"
              label={t('station.points')}
              value={
                result.pointsMax === null
                  ? String(result.ringedFigurePoints)
                  : `${result.ringedFigurePoints}/${result.pointsMax}`
              }
            />
          )}
        </View>
      </Card>

      {stations.length === 0 ? (
        <EmptyState title={t('station.noStations')} body={t('station.noStationsBody')} />
      ) : (
        <Card>
          {stations.map((station) => {
            // Struck out or shot off: shown in place, never in the result.
            const excluded = station.isScratched === 1 || station.isShootOff === 1;
            return (
              <Pressable
                key={station.id}
                accessibilityRole="button"
                testID={`station-row-${station.position}`}
                onPress={() => router.push(`/session/${sessionId}/station/${station.position}`)}
                style={styles.row}
              >
                <ThemedText type="small" themeColor={excluded ? 'textSecondary' : 'text'}>
                  {t('station.title', { position: station.position })}
                </ThemedText>
                <View style={styles.rowRight}>
                  {station.isScratched === 1 && <Chip label={t('station.scratched')} />}
                  {station.isShootOff === 1 && <Chip label={t('station.shootOff')} />}
                  <ThemedText
                    type="smallBold"
                    themeColor={excluded ? 'textSecondary' : 'text'}
                    style={excluded ? styles.excluded : undefined}
                    testID={`station-score-${station.position}`}
                  >
                    {station.hits}/{station.figuresHit}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      <Card>
        <PrimaryButton
          label={t('session.addStation')}
          onPress={() => router.push(`/session/${sessionId}/station/${nextPosition}?new=1`)}
          testID="add-station"
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  metricCard: {
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.half,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  excluded: {
    textDecorationLine: 'line-through',
  },
});
