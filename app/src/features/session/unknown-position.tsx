import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

/** What a series or station route shows when its position is not a whole number (#837). */
export function UnknownPosition() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <Card>
        <ThemedText themeColor="textSecondary" testID="unknown-position">
          {t('session.positionNotFound')}
        </ThemedText>
      </Card>
      <PrimaryButton label={t('common.close')} onPress={() => router.back()} />
    </Screen>
  );
}
