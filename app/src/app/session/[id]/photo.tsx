// The series photo, full screen. Until now a photo was write-only: stored on
// the series, synced, included in backups, and shown exactly once — on the
// marking screen while you scored it. The "Photo attached" chip said it
// existed and nothing could open it.
//
// Route shape mirrors scan.tsx (`?pos=`), so both act on a series without
// nesting the series route.
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { resolveSeriesPhotoUri } from '@/platform/sync-photos';
import { Spacing } from '@/theme/tokens';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export default function SeriesPhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos } = useLocalSearchParams<{ id: string; pos?: string }>();
  const position = Number(pos ?? '1');

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  const uri = resolveSeriesPhotoUri(row?.photoUri ?? null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Same gesture set as the marking overlay, so the two feel the same: pinch
  // to zoom, two fingers to pan, double-tap to fit.
  const zoom = useSharedValue(1);
  const zoomStart = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      zoomStart.value = zoom.value;
    })
    .onUpdate((event) => {
      zoom.value = clamp(zoomStart.value * event.scale, MIN_ZOOM, MAX_ZOOM);
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      panStartX.value = panX.value;
      panStartY.value = panY.value;
    })
    .onUpdate((event) => {
      panX.value = panStartX.value + event.translationX;
      panY.value = panStartY.value + event.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = zoom.value > MIN_ZOOM;
      zoom.value = withTiming(zoomed ? MIN_ZOOM : 3);
      if (zoomed) {
        panX.value = withTiming(0);
        panY.value = withTiming(0);
      }
    });

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  }

  if (!uri) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">{t('session.photoMissingTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('session.photoMissingBody')}</ThemedText>
        </Card>
        <PrimaryButton label={t('common.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('session.seriesTitle', { position })}
      </ThemedText>
      <View style={styles.stage} onLayout={onLayout}>
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
          <Animated.View style={[styles.stage, zoomStyle]}>
            <Image
              source={{ uri }}
              style={{ width: box.width, height: box.height }}
              contentFit="contain"
              testID="series-photo"
            />
          </Animated.View>
        </GestureDetector>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('photoScoring.zoomHint')}
      </ThemedText>
      {/* The path #176 removed when the duplicate entry point went: this is
          the only way back to scoring a series that already exists. */}
      <PrimaryButton
        label={t('session.photoRescore')}
        onPress={() => router.replace(`/session/${id}/scan?pos=${position}`)}
        testID="photo-rescore"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    overflow: 'hidden',
    marginVertical: Spacing.two,
  },
});
