// Fält station entry (#315, reworked in #567). A station answers four
// questions in one screen: did every shot hit, did I hit every figure, did I
// score points, and what could I have scored. Each count is one row of
// equal-width segments, so 0-6 never wraps.
//
// A station reached via "Add Station" (`?new=1`) does not exist in the
// database yet. It is created by Save, and only when something was entered —
// the same orphan-row trap the series screen already avoids.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import {
  clampFiguresHit,
  figuresHitRange,
  isBlankStation,
  SHOTS_PER_STATION,
  stationPoints,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import {
  addStation,
  listStationsForSession,
  softDeleteStation,
  updateStation,
} from '@/db/queries/falt';
import { Spacing } from '@/theme/tokens';

const NOT_RECORDED = 'none';

/** min…max as segments. */
function countSegments(max: number, min = 0) {
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => {
    const value = String(min + index);
    return { value, label: value };
  });
}

export default function StationEntryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos, shootOff } = useLocalSearchParams<{
    id: string;
    pos: string;
    new?: string;
    shootOff?: string;
  }>();
  const position = Number(pos);

  const row =
    listStationsForSession(db, id).find((station) => station.position === position) ?? null;

  const [hits, setHits] = useState(row?.hits ?? 0);
  const [figuresHit, setFiguresHit] = useState(row?.figuresHit ?? 0);
  const [figureCount, setFigureCount] = useState<number | null>(row?.figureCount ?? null);
  const [pointsText, setPointsText] = useState(row?.points == null ? '' : String(row.points));
  const [pointsMaxText, setPointsMaxText] = useState(
    row?.pointsMax == null ? '' : String(row.pointsMax),
  );
  const [isScratched, setIsScratched] = useState(row?.isScratched === 1);
  // Set by the round, not here: Start Shoot-off makes this and every later
  // station a shoot-off (#715).
  const isShootOff = row ? row.isShootOff === 1 : shootOff === '1';

  // The constraints are expressed by what the controls offer, not by
  // validating after the fact: a figure cannot be hit more times than shots
  // hit it, hits have to land somewhere, and no more figures can be hit than
  // the station set out.
  const figuresHitBounds = figuresHitRange(hits, figureCount);
  function onHitsChange(next: number) {
    setHits(next);
    setFiguresHit(clampFiguresHit(figuresHit, next, figureCount));
  }
  function onFigureCountChange(next: number | null) {
    setFigureCount(next);
    setFiguresHit(clampFiguresHit(figuresHit, hits, next));
  }

  const parsedPoints = stationPoints(pointsText, pointsMaxText);
  const pointsInvalid = !parsedPoints.ok;

  function onSave() {
    if (!parsedPoints.ok) return;

    const patch = {
      hits,
      figuresHit,
      figureCount,
      points: parsedPoints.points,
      pointsMax: parsedPoints.pointsMax,
      isScratched,
      isShootOff,
    };

    if (row) {
      updateStation(db, row.id, patch);
    } else {
      // Nothing entered, nothing to keep — saving a blank station would
      // recreate the empty row this flow exists to avoid.
      if (isBlankStation(patch)) {
        router.back();
        return;
      }
      addStation(db, { sessionId: id, position, ...patch });
    }
    router.back();
  }

  function onDelete() {
    if (!row) {
      router.back();
      return;
    }
    Alert.alert(t('station.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('station.delete'),
        style: 'destructive',
        onPress: () => {
          softDeleteStation(db, row.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{t('station.title', { position })}</ThemedText>
      {isShootOff && <Chip label={t('station.shootOff')} testID="station-shoot-off" />}

      <Card>
        <ThemedText type="smallBold">{t('station.hits')}</ThemedText>
        <SegmentedControl
          options={countSegments(SHOTS_PER_STATION)}
          value={String(hits)}
          onChange={(value) => onHitsChange(Number(value))}
          scrollable={false}
          testID="station-hits"
        />

        <ThemedText type="smallBold">{t('station.figuresHit')}</ThemedText>
        <SegmentedControl
          // Never more figures than hits or than the station has, and never
          // zero while hits exist.
          options={countSegments(figuresHitBounds.max, figuresHitBounds.min)}
          value={String(figuresHit)}
          onChange={(value) => setFiguresHit(Number(value))}
          scrollable={false}
          testID="station-figures-hit"
        />

        <ThemedText type="smallBold">{t('station.figureCount')}</ThemedText>
        <SegmentedControl
          options={[{ value: NOT_RECORDED, label: '–' }, ...countSegments(SHOTS_PER_STATION, 1)]}
          value={figureCount === null ? NOT_RECORDED : String(figureCount)}
          onChange={(value) => onFigureCountChange(value === NOT_RECORDED ? null : Number(value))}
          scrollable={false}
          testID="station-figure-count"
        />

        <ThemedText type="smallBold">{t('station.points')}</ThemedText>
        <View style={styles.pointsRow}>
          <TextField
            value={pointsText}
            onChangeText={setPointsText}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.pointsField}
            accessibilityLabel={t('station.points')}
            testID="station-points"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('station.of')}
          </ThemedText>
          <TextField
            value={pointsMaxText}
            onChangeText={setPointsMaxText}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.pointsField}
            accessibilityLabel={t('station.pointsMax')}
            testID="station-points-max"
          />
        </View>
        {pointsInvalid && (
          <ThemedText type="small" themeColor="danger" testID="station-points-invalid">
            {t('station.pointsInvalid')}
          </ThemedText>
        )}
      </Card>

      {/* A station is known to be scratched only afterwards, so the switch is
          offered when editing one, not when entering it (#715). */}
      {row && (
        <Card>
          <View style={styles.switchRow}>
            <ThemedText type="small">{t('station.scratched')}</ThemedText>
            <Switch
              value={isScratched}
              onValueChange={setIsScratched}
              testID="station-scratched-toggle"
            />
          </View>
        </Card>
      )}

      <PrimaryButton label={t('station.save')} onPress={onSave} testID="save-station" />
      {row && (
        <SecondaryButton
          label={t('station.delete')}
          tone="danger"
          onPress={onDelete}
          testID="delete-station"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pointsField: {
    flex: 1,
    // A web input's intrinsic width otherwise pushes the second field off screen.
    minWidth: 0,
  },
});
