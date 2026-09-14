// Settings → Theme. Same shape as the Language page next to it, and a
// drill-down for the same reason (#138).
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SegmentedControl } from '@/components/segmented-control';
import { useAppSettings, type ThemeSetting } from '@/state/app-settings';

export default function ThemeSettingsScreen() {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppSettings();

  const options: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: t('settings.themeSystem') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.theme') }} />
      <ScreenTitle>{t('settings.theme')}</ScreenTitle>
      <Card>
        <SegmentedControl
          options={options}
          value={theme}
          onChange={setTheme}
          testID="theme-picker"
        />
      </Card>
    </Screen>
  );
}
