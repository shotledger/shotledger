import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = useAppSettings();
  const colors = useTheme();
  const [birthYear, setBirthYear] = useState(() => {
    const stored = db ? getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null) : null;
    return stored === null ? '' : String(stored);
  });

  // Only a plausible four-digit year is stored; anything else clears the
  // setting, and the märke age reduction then simply does not apply (§6.5).
  function onChangeBirthYear(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    setBirthYear(digits);
    if (!db) return;
    const year = Number(digits);
    const valid = digits.length === 4 && year >= 1900 && year <= new Date().getFullYear();
    setSetting<number | null>(db, SETTINGS_KEYS.birthYear, valid ? year : null);
  }

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
        <ThemedText type="smallBold">{t('settings.birthYear')}</ThemedText>
        <TextInput
          value={birthYear}
          onChangeText={onChangeBirthYear}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="1970"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          testID="birth-year"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.birthYearHelp')}
        </ThemedText>
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
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
