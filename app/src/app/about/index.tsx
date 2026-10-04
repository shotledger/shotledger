// About screen (§4 M7): version, open-source licenses, repo link.
// Read-only informational content, reachable from Settings.
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import licenses from '@/constants/licenses.json';
import { REPO_URL } from '@/constants/links';
import { NATIVE_LICENSES } from '@/constants/native-licenses';

export default function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen>
      <ScreenTitle>{t('about.title')}</ScreenTitle>

      <Card>
        <ThemedText type="smallBold">{t('about.appName')}</ThemedText>
        <ThemedText type="default">{t('about.version', { version })}</ThemedText>
      </Card>

      <Card>
        <ListRow
          title={t('about.licensesTitle')}
          subtitle={t('about.licensesSubtitle', {
            count: licenses.length + NATIVE_LICENSES.length,
          })}
          onPress={() => router.push('/about/licenses')}
          testID="about-licenses-link"
        />
        <ListRow
          title={t('about.repoLink')}
          onPress={() => void Linking.openURL(REPO_URL)}
          testID="about-repo-link"
        />
      </Card>
    </Screen>
  );
}
