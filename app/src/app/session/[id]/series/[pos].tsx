import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// Placeholder — the ScoreKeypad entry screen ships in M3 (§5 screen inventory).
export default function SeriesEntryScreen() {
  const { t } = useTranslation();
  const { id, pos } = useLocalSearchParams<{ id: string; pos: string }>();

  return (
    <Screen scroll={false}>
      <ThemedText type="title">{t('session.seriesTitle', { position: pos })}</ThemedText>
      <ThemedText themeColor="textSecondary">{id}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('session.placeholder')}</ThemedText>
    </Screen>
  );
}
