// Series entry (§4 M3; #822 direction A, "Entering a series"): the
// ScoreKeypad bound to one series. All keypad behaviour lives in
// shared/scoring/entry.ts; this screen seeds the state from the stored shots,
// persists on save, and offers the per-series photo.
//
// Layout: what to read (the title, the gold hint, the earlier series, the
// photo) scrolls at the top; everything a thumb presses — the running totals,
// the shot cells, the tool row, the keys and the one primary action — is
// pinned to the bottom of the screen. Next Series saves this series and opens
// the next one; it never fires on its own after the last shot, because the
// shooter may still need to correct one (maintainer, 2026-10-14). On the last
// series of a fixed format the action is Save Series.
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
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { createKeypadState, enteredShots, type KeypadState } from '@shotledger/shared';

import { Header } from '@/components/header';
import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { formatScore, KeypadTool, ScoreKeypad } from '@/components/score-keypad';
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
import { loadLastTime } from '@/features/session-entry/last-time';
import {
  liveSessionTotals,
  nextSeriesTarget,
  seriesCountOf,
} from '@/features/session-entry/series-entry-model';
import {
  celebratesDiscipline,
  celebrationTier,
  tierToCelebrate,
  type CelebrationTier,
} from '@/features/session/celebration';
import { disciplineLabel } from '@/features/session/labels';
import { pickSeriesPhoto } from '@/features/session/pick-photo';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { keepSeriesPhoto } from '@/platform/series-photos';
import { resolveSeriesPhotoUri, seriesPhotoGone } from '@/platform/sync-photos';
import { useTheme } from '@/hooks/use-theme';
import { useFeatures } from '@/features/settings/feature-visibility';
import { Radius, Spacing, TabularNums } from '@/theme/tokens';

/**
 * Next Series replaces this route with the next series' one. Keyed by the
 * series, so the keypad, the photo and the celebration state start afresh
 * even where the router reuses the screen instance.
 */
export default function SeriesEntryRoute() {
  const { id, pos } = useLocalSearchParams<{ id: string; pos: string }>();
  return <SeriesEntryScreen key={`${id}:${pos}`} />;
}

/** Whether `persist` kept the series (or had nothing to keep) or left the screen itself. */
type PersistOutcome = 'saved' | 'nothing' | 'left';

function SeriesEntryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const features = useFeatures();
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

  const shots = enteredShots(state);
  const current = { rowId: row?.id ?? null, position, isFinal, isSighter, shots };
  const sessionTotals = liveSessionTotals(
    detail.seriesRows,
    current,
    detail.session?.innerTenCount ?? null,
  );
  // Read once, as if this series were scored; a sighter compares with nothing.
  const [lastTimeScored] = useState(() =>
    detail.session
      ? loadLastTime(detail.session, detail.seriesRows, {
          rowId: row?.id ?? null,
          position,
          isFinal,
          isSighter: false,
        })
      : null,
  );
  const lastTime = isSighter ? null : lastTimeScored;
  const next = nextSeriesTarget(detail.seriesRows, { position, isFinal }, detail.isFixedFormat);
  const seriesCount = seriesCountOf(detail.seriesRows, isFinal, detail.isFixedFormat);
  const isBlank = shots.length === 0 && photoUri === null && !isSighter;
  const earlier = detail.seriesRows
    .filter((other) => other.id !== row?.id && other.isFinal === isFinal)
    .sort((a, b) => a.position - b.position);

  function onKeypadChange(nextState: KeypadState) {
    setState(nextState);
    const reached = tierToCelebrate(highestTier.current, tierOf(nextState, isSighter));
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

  function persist(): PersistOutcome {
    const toSave = shots.map((shot) => ({
      valueTenths: shot.valueTenths,
      isInnerTen: shot.isInnerTen,
    }));

    let seriesId = row?.id;
    if (seriesId === undefined) {
      // Nothing entered, nothing to keep: saving a blank new series would
      // recreate exactly the empty row this flow exists to avoid.
      if (isBlank) return 'nothing';
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
          return 'left';
        }
        throw error;
      }
    }

    saveSeriesShots(db, seriesId, toSave);

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
          return 'left';
        }
        throw error;
      }
    }
    return 'saved';
  }

  function onSave() {
    if (persist() !== 'left') router.back();
  }

  function onNext() {
    if (!next || persist() === 'left') return;
    const finalParam = next.isFinal ? '&final=1' : '';
    // Always the keypad: the shooter is on it, mid-session. Photo scoring
    // stays one tap away in the tool row.
    router.replace(
      next.isNew
        ? `/session/${id}/series/${next.position}?new=1${finalParam}`
        : `/session/${id}/series/${next.position}`,
    );
  }

  const disciplineName = detail.session ? disciplineLabel(t, detail.session.disciplineId) : '';
  const subtitle = [
    disciplineName,
    // Shown here only when the tool row cannot: the sighter appears once.
    isSighter && !showSighterOption ? t('session.sighter') : null,
    row?.timeLimitSeconds != null
      ? t('session.timeLimit', { seconds: row.timeLimitSeconds })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const totals = (
    <>
      <View
        style={styles.stat}
        accessible
        accessibilityLabel={`${t('entryA.sessionTotal')} ${formatScore(sessionTotals.totalTenths)}, ${t('entryA.innerTens', { count: sessionTotals.innerTens })}`}
      >
        <View style={styles.valueRow}>
          <ThemedText type="headline" style={TabularNums} testID="session-running-total">
            {formatScore(sessionTotals.totalTenths)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={TabularNums}>
            {t('entryA.innerTens', { count: sessionTotals.innerTens })}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('entryA.sessionTotal')}
        </ThemedText>
      </View>
      {lastTime && (
        <View
          style={styles.stat}
          accessible
          accessibilityLabel={`${t('entryA.lastTime')} ${formatScore(lastTime.totalTenths)}`}
          testID="last-time"
        >
          <View style={styles.valueRow}>
            <ThemedText type="headline" themeColor="textSecondary" style={TabularNums}>
              {formatScore(lastTime.totalTenths)}
            </ThemedText>
            {lastTime.innerTens !== null && (
              <ThemedText type="small" themeColor="textSecondary" style={TabularNums}>
                {t('entryA.innerTens', { count: lastTime.innerTens })}
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('entryA.lastTime')}
          </ThemedText>
        </View>
      )}
    </>
  );

  const tools = (
    <>
      {/* Target photos hidden (#801): a photo already here still shows above. */}
      {features.photos && (
        <KeypadTool
          label={t(photoUri ? 'session.replacePhoto' : 'entryA.photo')}
          accessibilityLabel={t(photoUri ? 'session.replacePhoto' : 'session.addPhoto')}
          onPress={() => void onAttachPhoto()}
          testID="attach-photo"
        />
      )}
      {showSighterOption && (
        <KeypadTool
          label={t('session.sighter')}
          accessibilityLabel={t('session.sighterOnThisSeries')}
          selected={isSighter}
          onPress={() => setIsSighter((was) => !was)}
          testID="series-sighter-toggle"
        />
      )}
    </>
  );

  const footer = (
    <>
      <ScoreKeypad
        state={state}
        onChange={onKeypadChange}
        celebration={celebration}
        highlightTotal={currentTier !== null}
        totals={totals}
        tools={tools}
      />
      {next ? (
        <View style={styles.actions}>
          <SecondaryButton
            label={t('session.save')}
            onPress={onSave}
            testID="save-series"
            style={styles.action}
          />
          <PrimaryButton
            label={t('entryA.nextSeries')}
            onPress={onNext}
            disabled={isBlank && isUnsaved}
            testID="next-series"
            style={[styles.action, isBlank && isUnsaved && styles.disabled]}
          />
        </View>
      ) : (
        <PrimaryButton label={t('session.save')} onPress={onSave} testID="save-series" />
      )}
    </>
  );

  return (
    <Screen footer={footer}>
      <Header
        title={
          seriesCount !== null
            ? t('entryA.seriesOfTitle', { position, count: seriesCount })
            : t('session.seriesTitle', { position })
        }
        subtitle={subtitle}
      />

      {guldThreshold != null && !isSighter && (
        <ThemedText type="small" themeColor="textSecondary" testID="guld-hint">
          {t('session.guldAt', { points: guldThreshold })}
        </ThemedText>
      )}

      {earlier.length > 0 && (
        // One text per series, so a wrap falls between series, never inside one.
        <View style={styles.earlier} testID="earlier-series">
          {earlier.map((other) => (
            <ThemedText key={other.id} type="small" themeColor="textSecondary" style={TabularNums}>
              {t(other.isSighter ? 'entryA.seriesShortSighter' : 'entryA.seriesShort', {
                position: other.position,
                total: formatScore(other.totalTenths),
              })}
            </ThemedText>
          ))}
        </View>
      )}

      {/* The photo is visible rather than merely announced. Tapping opens
          the full-screen view. */}
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
    height: 160,
    borderRadius: Radius.medium,
  },
  thumbMissing: { alignItems: 'center', justifyContent: 'center', padding: Spacing.two },
  stat: {
    gap: Spacing.half,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  earlier: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
