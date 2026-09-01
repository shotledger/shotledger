// About screen (§4 M7): version, open-source licenses note, repo link.
// Read-only informational content, reachable from Settings.
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { REPO_URL } from '@/constants/links';

export default function AboutScreen() {
  const { t } = useTranslation();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen>
      <ThemedText type="title">{t('about.title')}</ThemedText>

      <Card>
        <ThemedText type="smallBold">{t('about.appName')}</ThemedText>
        <ThemedText type="default">{t('about.version', { version })}</ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('about.licensesTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('about.licensesBody')}
        </ThemedText>
      </Card>

      <Card>
        <ListRow
          title={t('about.repoLink')}
          onPress={() => Linking.openURL(REPO_URL)}
          testID="about-repo-link"
        />
      </Card>
    </Screen>
  );
}
