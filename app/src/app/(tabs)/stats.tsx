import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// Live views land in M5 — this is a placeholder shell so the tab renders
// and navigates correctly (§4 M2).
export default function StatsScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <ThemedText type="title">{t('stats.title')}</ThemedText>
      <EmptyState title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />
    </Screen>
  );
}
