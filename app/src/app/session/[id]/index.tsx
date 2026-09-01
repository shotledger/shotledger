import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// Placeholder — series list + stats toggle ships in M3 (§5 screen inventory).
export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scroll={false}>
      <ThemedText type="title">{t('session.detailTitle')}</ThemedText>
      <ThemedText themeColor="textSecondary">{id}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('session.placeholder')}</ThemedText>
    </Screen>
  );
}
