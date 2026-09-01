import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// Placeholder — the new-session form ships in M3 (score entry). This route
// exists now so navigation from Home's FAB works end to end (§4 M2).
export default function NewSessionScreen() {
  const { t } = useTranslation();

  return (
    <Screen scroll={false}>
      <ThemedText type="title">{t('session.newTitle')}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('session.placeholder')}</ThemedText>
    </Screen>
  );
}
