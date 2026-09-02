// Series entry (§4 M3): the ScoreKeypad bound to one series. All keypad
// behaviour lives in shared/scoring/entry.ts; this screen seeds the state
// from the stored shots, persists on save, and offers the per-series photo.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { createKeypadState, enteredShots, type KeypadState } from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { ScoreKeypad } from '@/components/score-keypad';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { saveSeriesShots } from '@/db/queries/round-count';
import { updateSeries } from '@/db/queries/series';
import { pickSeriesPhoto } from '@/features/session/pick-photo';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { resolveSeriesPhotoUri } from '@/platform/sync-photos';
import { Spacing } from '@/theme/tokens';

export default function SeriesEntryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos } = useLocalSearchParams<{ id: string; pos: string }>();
  const position = Number(pos);

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);

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

  async function onAttachPhoto() {
    const uri = await pickSeriesPhoto();
    if (uri === 'denied') {
      Alert.alert(t('session.photoPermissionDenied'));
      return;
    }
    if (uri && db && row) {
      setPhotoUri(uri);
      updateSeries(db, row.id, { photoUri: uri });
    }
  }

  function onSave() {
    if (db && row) {
      saveSeriesShots(
        db,
        row.id,
        enteredShots(state).map((shot) => ({
          valueTenths: shot.valueTenths,
          isInnerTen: shot.isInnerTen,
        })),
      );
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
          {row?.isSighter && <Chip label={t('session.sighter')} />}
          {row?.timeLimitSeconds != null && (
            <Chip label={t('session.timeLimit', { seconds: row.timeLimitSeconds })} />
          )}
          {photoUri && <Chip label={t('session.photoAdded')} />}
        </View>
      </View>

      {row?.guldThreshold != null && !row.isSighter && (
        <ThemedText type="small" themeColor="textSecondary" testID="guld-hint">
          {t('session.guldAt', { points: row.guldThreshold })}
        </ThemedText>
      )}

      <Card>
        <ScoreKeypad state={state} onChange={setState} />
      </Card>

      <PrimaryButton label={t('session.addPhoto')} onPress={onAttachPhoto} testID="attach-photo" />
      <PrimaryButton label={t('session.save')} onPress={onSave} testID="save-series" />
      {row && row.shots.length > 0 && (
        <PrimaryButton
          label={t('share.shareSeries')}
          onPress={() => router.push(`/session/${id}/share?series=${position}`)}
          testID="share-series"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
