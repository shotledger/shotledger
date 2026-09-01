import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// Full inventory + barometer chips land in M4 — placeholder shell for now
// (§4 M2: tabs must render and navigate correctly).
export default function FirearmsScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <ThemedText type="title">{t('firearms.title')}</ThemedText>
      <EmptyState title={t('firearms.emptyTitle')} body={t('firearms.emptyBody')} />
    </Screen>
  );
}
