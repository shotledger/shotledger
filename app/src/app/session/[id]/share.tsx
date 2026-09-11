// Share card preview: renders the session (or, with `?series=`, a single
// series) card, lets the user add an opt-in free-text line, and shares the
// rasterized PNG through the OS share sheet — the user always sees exactly
// what leaves the device before it does.
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import {
  SeriesShareCardSvg,
  SessionShareCardSvg,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type ShareCardSvgRef,
} from '@/components/share-card-svg';
import { ThemedText } from '@/components/themed-text';
import {
  buildSeriesShareCardModel,
  buildSessionShareCardModel,
} from '@/features/share/use-share-card';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { shareCardPng } from '@/platform/share-card';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export default function ShareCardScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { id, series } = useLocalSearchParams<{ id: string; series?: string }>();
  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const seriesPosition = series ? Number(series) : null;
  const row = seriesPosition
    ? detail.seriesRows.find((r) => r.position === seriesPosition)
    : undefined;

  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);
  const svgRef = useRef<ShareCardSvgRef>(null);

  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.min(windowWidth - Spacing.three * 2, 420);
  const previewHeight = previewWidth * (SHARE_CARD_HEIGHT / SHARE_CARD_WIDTH);
  const scale = previewWidth / SHARE_CARD_WIDTH;

  const sessionModel =
    seriesPosition === null ? buildSessionShareCardModel(t, i18n.language, detail, note) : null;
  const seriesModel =
    seriesPosition !== null && row
      ? buildSeriesShareCardModel(t, i18n.language, detail, row, note)
      : null;

  if (!detail.session || (seriesPosition !== null && !row)) {
    return (
      <Screen>
        <ScreenTitle>{t('share.title')}</ScreenTitle>
      </Screen>
    );
  }

  async function onShare() {
    if (!svgRef.current) return;
    setSharing(true);
    try {
      svgRef.current.toDataURL(
        (base64: string) => {
          void shareCardPng(
            base64,
            `shotledger-${id}${seriesPosition ? `-s${seriesPosition}` : ''}.png`,
          )
            .then((ok) => {
              if (!ok) Alert.alert(t('share.shareFailed'));
            })
            .finally(() => setSharing(false));
        },
        { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
      );
    } catch {
      setSharing(false);
      Alert.alert(t('share.shareFailed'));
    }
  }

  return (
    <Screen>
      <ScreenTitle>
        {seriesPosition !== null ? t('share.seriesTitle') : t('share.title')}
      </ScreenTitle>

      <View
        style={[
          styles.previewFrame,
          { width: previewWidth, height: previewHeight, borderColor: theme.border },
        ]}
        testID="share-card-preview"
      >
        <View
          style={[
            styles.previewInner,
            { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, transform: [{ scale }] },
          ]}
        >
          {sessionModel && <SessionShareCardSvg ref={svgRef} model={sessionModel} />}
          {seriesModel && <SeriesShareCardSvg ref={svgRef} model={seriesModel} />}
        </View>
      </View>

      <Card>
        <ThemedText type="smallBold">{t('share.noteLabel')}</ThemedText>
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={t('share.notePlaceholder')}
          maxLength={120}
          testID="share-note"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('share.notePrivacyHint')}
        </ThemedText>
      </Card>

      <PrimaryButton
        label={sharing ? t('share.sharing') : t('share.share')}
        onPress={onShare}
        disabled={sharing}
        testID="share-card-share"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewFrame: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewInner: {
    transformOrigin: 'top left',
  },
});
