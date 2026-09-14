// Settings → Language. A drill-down because no setting is set directly under
// Settings any more (maintainer, #138); the Settings row shows the current
// choice, so this page is only opened to change it.
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SegmentedControl } from '@/components/segmented-control';
import { useAppSettings, type LanguageSetting } from '@/state/app-settings';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppSettings();

  const options: { value: LanguageSetting; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'sv', label: t('settings.languageSv') },
    { value: 'en', label: t('settings.languageEn') },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.language') }} />
      <ScreenTitle>{t('settings.language')}</ScreenTitle>
      <Card>
        <SegmentedControl
          options={options}
          value={language}
          onChange={setLanguage}
          testID="language-picker"
        />
      </Card>
    </Screen>
  );
}
