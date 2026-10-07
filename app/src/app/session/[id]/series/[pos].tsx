// Series entry (§4 M3): the ScoreKeypad bound to one series. All keypad
// behavior lives in shared/scoring/entry.ts; this screen seeds the state
// from the stored shots, persists on save, and offers the per-series photo.
//
// A series reached via "Add Series" (`?new=1`) does not exist in the database
// yet — it is created here, by Save, and only when there is something to
// record. Creating it up front left an orphaned "Series N · 0" row behind
// every time the user backed out without saving (maintainer, verified live
// 2026-09-03).
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { createKeypadState, enteredShots, type KeypadState } from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { ScoreKeypad } from '@/components/score-keypad';
import type { Celebration } from '@/components/series-celebration';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { saveSeriesShots } from '@/db/queries/round-count';
import {
  addSeries,
  SighterLimitExceededError,
  setSeriesSighter,
  updateSeries,
} from '@/db/queries/series';
import {
  celebratesDiscipline,
  celebrationTier,
  tierToCelebrate,
  type CelebrationTier,
} from '@/features/session/celebration';
import { pickSeriesPhoto } from '@/features/session/pick-photo';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { keepSeriesPhoto } from '@/platform/series-photos';
import { resolveSeriesPhotoUri, seriesPhotoGone } from '@/platform/sync-photos';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export default function SeriesEntryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id, pos, final } = useLocalSearchParams<{
    id: string;
    pos: string;
    new?: string;
    final?: string;
  }>();
  const position = Number(pos);

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  // "Not saved yet" is the absence of a row, not the `?new=1` flag — coming
  // back to a series that was saved on a previous visit must edit it in place.
  const isUnsaved = row == null;
  const isFinal = row?.isFinal ?? final === '1';

  const [state, setState] = useState<KeypadState>(() =>
    createKeypadState({
      mode: detail.scoringMode,
      seriesLength: detail.seriesLength,
      shots: row?.shots ?? [],
    }),
  );
  // A synced series carries a `shotledger-photo:` marker, not a path — it
  // reads as "no photo yet" until the download queue has fetched the file.
  const [photoUri, setPhotoUri] = useState<string | null>(() =>
    resolveSeriesPhotoUri(row?.photoUri ?? null),
  );
  const [isSighter, setIsSighter] = useState(row?.isSighter ?? false);

  // The sighter choice lives here, not on the add-series step (maintainer:
  // "the sighter toggle should be one step down"). A section allows at most
  // one sighter (§6.3): hide the option once another series in this round
  // already holds it. Deliberately excludes this row itself — reusing
  // detail.mainHasSighter/finalHasSighter as-is would count this series'
  // own (possibly stale, possibly just-toggled-off) flag and hide the
  // control out from under whoever is using it, breaking "a series that IS
  // the current sighter must still be able to turn itself off". Fixed-format
  // programs pre-create their series to match the skeleton, so the choice
  // isn't offered there at all.
  const otherSeriesHasSighter = detail.seriesRows.some(
    (other) => other.id !== row?.id && other.isFinal === isFinal && other.isSighter,
  );
  const showSighterOption = !detail.isFixedFormat && !otherSeriesHasSighter;

  const guldThreshold = row ? row.guldThreshold : detail.guldThreshold;

  // #482: celebrate only a tier this visit climbs into — reopening a saved
  // 50, or backspacing and re-entering, stays quiet.
  const celebrates = celebratesDiscipline(detail.session?.disciplineId);
  const tierOf = (next: KeypadState, sighter: boolean): CelebrationTier | null =>
    celebrates
      ? celebrationTier(next.shots, {
          mode: next.mode,
          seriesLength: next.seriesLength,
          guldThreshold,
          isSighter: sighter,
        })
      : null;
  const highestTier = useRef<CelebrationTier | null>(tierOf(state, isSighter));
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const currentTier = tierOf(state, isSighter);

  function onKeypadChange(next: KeypadState) {
    setState(next);
    const reached = tierToCelebrate(highestTier.current, tierOf(next, isSighter));
    if (reached === null) return;
    highestTier.current = reached;
    setCelebration((prev) => ({ tier: reached, id: (prev?.id ?? 0) + 1 }));
  }

  async function onAttachPhoto() {
    const uri = await pickSeriesPhoto();
    if (uri === 'denied') {
      Alert.alert(t('session.photoPermissionDenied'));
      return;
    }
    if (!uri) return;
    // An unsaved series has no row to patch — the picked photo rides along
    // with the row Save creates, and leaves the picker's cache then.
    const kept = row ? keepSeriesPhoto(uri) : uri;
    setPhotoUri(kept);
    if (row) updateSeries(db, row.id, { photoUri: kept });
  }

  function onSave() {
    const shots = enteredShots(state).map((shot) => ({
      valueTenths: shot.valueTenths,
      isInnerTen: shot.isInnerTen,
    }));

    let seriesId = row?.id;
    if (seriesId === undefined) {
      // Nothing entered, nothing to keep: saving a blank new series would
      // recreate exactly the empty row this flow exists to avoid.
      if (shots.length === 0 && photoUri === null && !isSighter) {
        router.back();
        return;
      }
      try {
        seriesId = addSeries(db, {
          sessionId: id,
          position,
          isFinal,
          isSighter,
          photoUri: photoUri && keepSeriesPhoto(photoUri),
        }).id;
      } catch (error) {
        if (error instanceof SighterLimitExceededError) {
          Alert.alert(t('session.sighterUsed'));
          router.back();
          return;
        }
        throw error;
      }
    }

    saveSeriesShots(db, seriesId, shots);

    if (row && isSighter !== (row.isSighter ?? false)) {
      try {
        setSeriesSighter(db, row.id, isSighter);
      } catch (error) {
        // The UI already hides the option once another series holds the
        // section's sighter, so this is a defensive fallback, not the
        // normal path.
        if (error instanceof SighterLimitExceededError) {
          Alert.alert(t('session.sighterUsed'));
          router.back();
          return;
        }
        throw error;
      }
    }

    router.back();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('session.seriesTitle', { position })}
        </ThemedText>
        <View style={styles.badges}>
          {isSighter && <Chip label={t('session.sighter')} />}
          {row?.timeLimitSeconds != null && (
            <Chip label={t('session.timeLimit', { seconds: row.timeLimitSeconds })} />
          )}
        </View>
      </View>

      {guldThreshold != null && !isSighter && (
        <ThemedText type="small" themeColor="textSecondary" testID="guld-hint">
          {t('session.guldAt', { points: guldThreshold })}
        </ThemedText>
      )}

      <Card>
        <ScoreKeypad
          state={state}
          onChange={onKeypadChange}
          celebration={celebration}
          highlightTotal={currentTier !== null}
        />
      </Card>

      {/* A thumbnail where Add Photo already lives, so the photo is visible
          rather than merely announced. Tapping opens the full-screen view. */}
      {photoUri && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('session.photoView')}
          onPress={() => router.push(`/session/${id}/photo?pos=${position}`)}
          testID="series-photo-thumb"
        >
          {seriesPhotoGone(photoUri) ? (
            <View
              style={[
                styles.thumb,
                styles.thumbMissing,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary" testID="series-photo-missing">
                {t('session.photoGone')}
              </ThemedText>
            </View>
          ) : (
            <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
          )}
        </Pressable>
      )}

      <PrimaryButton
        label={t(photoUri ? 'session.replacePhoto' : 'session.addPhoto')}
        onPress={() => void onAttachPhoto()}
        testID="attach-photo"
      />

      {showSighterOption && (
        <Card>
          <View style={styles.switchRow}>
            <ThemedText type="small">{t('session.sighterOnThisSeries')}</ThemedText>
            <Switch value={isSighter} onValueChange={setIsSighter} testID="series-sighter-toggle" />
          </View>
        </Card>
      )}

      <PrimaryButton label={t('session.save')} onPress={onSave} testID="save-series" />
      {isUnsaved && (
        <ThemedText type="small" themeColor="textSecondary" testID="unsaved-series-hint">
          {t('session.newSeriesHint')}
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    height: 220,
    borderRadius: Radius.medium,
  },
  thumbMissing: { alignItems: 'center', justifyContent: 'center', padding: Spacing.two },
  header: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
