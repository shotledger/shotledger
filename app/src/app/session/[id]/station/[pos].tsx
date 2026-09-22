// Fält station entry (#315). The ring keypad has nothing to bind to here:
// holes are counted per figure after the series, so a station is two numbers
// the shooter reads off the marker's call — "five in three" — plus the
// poängmål where the arrangör designated one.
//
// A station reached via "Add Station" (`?new=1`) does not exist in the
// database yet. It is created by Save, and only when something was entered —
// the same orphan-row trap the series screen already avoids.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { SHOTS_PER_STATION } from '@shotledger/shared';

import { Card } from '@/components/card';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import {
  addStation,
  listStationsForSession,
  softDeleteStation,
  updateStation,
} from '@/db/queries/falt';
import { Spacing } from '@/theme/tokens';

/** 0…6 as picker options — a station is six shots, so there is no seventh hit. */
function countOptions(max: number, min = 0) {
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => {
    const value = String(min + index);
    return { value, label: value, testID: `count-${min + index}` };
  });
}

export default function StationEntryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos } = useLocalSearchParams<{ id: string; pos: string; new?: string }>();
  const position = Number(pos);

  const row = db
    ? (listStationsForSession(db, id).find((station) => station.position === position) ?? null)
    : null;

  const [hits, setHits] = useState(row?.hits ?? 0);
  const [figuresHit, setFiguresHit] = useState(row?.figuresHit ?? 0);
  const [hasPoints, setHasPoints] = useState(row?.points != null);
  const [points, setPoints] = useState(row?.points ?? 0);
  const [pointsMax, setPointsMax] = useState(row?.pointsMax ?? 0);
  const [isScratched, setIsScratched] = useState(row?.isScratched === 1);
  const [isShootOff, setIsShootOff] = useState(row?.isShootOff === 1);

  // The constraint is expressed by what the control offers, not by validating
  // after the fact: a figure cannot be hit more times than shots hit it, and
  // hits have to land somewhere (spec U3).
  function onHitsChange(next: number) {
    setHits(next);
    if (figuresHit > next) setFiguresHit(next);
    if (next > 0 && figuresHit === 0) setFiguresHit(1);
    if (next === 0) setFiguresHit(0);
  }

  function onSave() {
    if (!db) {
      router.back();
      return;
    }

    const patch = {
      hits,
      figuresHit,
      points: hasPoints ? points : null,
      pointsMax: hasPoints ? pointsMax : null,
      isScratched,
      isShootOff,
    };

    if (row) {
      updateStation(db, row.id, patch);
    } else {
      // Nothing entered, nothing to keep — saving a blank station would
      // recreate the empty row this flow exists to avoid.
      if (hits === 0 && !hasPoints && !isScratched && !isShootOff) {
        router.back();
        return;
      }
      addStation(db, { sessionId: id, position, ...patch });
    }
    router.back();
  }

  function onDelete() {
    if (!db || !row) {
      router.back();
      return;
    }
    Alert.alert(t('station.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('station.delete'),
        style: 'destructive',
        onPress: () => {
          softDeleteStation(db!, row.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{t('station.title', { position })}</ThemedText>

      <Card>
        <OptionPicker
          label={t('station.hits')}
          options={countOptions(SHOTS_PER_STATION)}
          value={String(hits)}
          onChange={(value) => onHitsChange(Number(value))}
        />
      </Card>

      <Card>
        <OptionPicker
          label={t('station.figuresHit')}
          // Never more figures than hits, and never zero while hits exist.
          options={countOptions(hits, hits > 0 ? 1 : 0)}
          value={String(figuresHit)}
          onChange={(value) => setFiguresHit(Number(value))}
        />
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('station.pointsTarget')}</ThemedText>
          <Switch value={hasPoints} onValueChange={setHasPoints} testID="station-poangmal-toggle" />
        </View>
        {hasPoints && (
          <>
            <OptionPicker
              label={t('station.points')}
              options={countOptions(Math.max(pointsMax, 10))}
              value={String(points)}
              onChange={(value) => setPoints(Number(value))}
            />
            <OptionPicker
              label={t('station.pointsMax')}
              options={countOptions(20, 1)}
              value={String(pointsMax)}
              onChange={(value) => setPointsMax(Number(value))}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t('station.pointsHelp')}
            </ThemedText>
          </>
        )}
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('station.scratched')}</ThemedText>
          <Switch
            value={isScratched}
            onValueChange={setIsScratched}
            testID="station-scratched-toggle"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('station.scratchedHelp')}
        </ThemedText>
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('station.shootOff')}</ThemedText>
          <Switch
            value={isShootOff}
            onValueChange={setIsShootOff}
            testID="station-shootoff-toggle"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('station.shootOffHelp')}
        </ThemedText>
      </Card>

      <PrimaryButton label={t('session.save')} onPress={onSave} testID="save-station" />
      {row && (
        <PrimaryButton label={t('station.delete')} onPress={onDelete} testID="delete-station" />
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
});
