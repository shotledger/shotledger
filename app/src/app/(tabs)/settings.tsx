import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { Spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = useAppSettings();

  const languageOptions: { value: LanguageSetting; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'sv', label: t('settings.languageSv') },
    { value: 'en', label: t('settings.languageEn') },
  ];
  const themeOptions: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: t('settings.themeSystem') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ];

  return (
    <Screen>
      <ThemedText type="title">{t('settings.title')}</ThemedText>

      <Card>
        <ThemedText type="smallBold">{t('settings.language')}</ThemedText>
        <SegmentedControl options={languageOptions} value={language} onChange={setLanguage} />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('settings.theme')}</ThemedText>
        <SegmentedControl options={themeOptions} value={theme} onChange={setTheme} />
      </Card>

      <Card>
        <ListRow
          title={t('settings.supportDevelopment')}
          subtitle={t('settings.supportComingSoon')}
        />
      </Card>

      {__DEV__ && (
        <View style={styles.devSection}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('settings.devSection')}
          </ThemedText>
          <Card>
            <ListRow
              title={t('settings.loadDemoData')}
              onPress={() => db && seedDemoData(db)}
              testID="settings-load-demo-data"
            />
            <ListRow
              title={t('settings.wipeData')}
              onPress={() => db && wipeDemoData(db)}
              testID="settings-wipe-data"
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  devSection: {
    gap: Spacing.two,
  },
});
