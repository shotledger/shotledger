import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import type { ProfileSelection } from '@shotledger/shared';

import { SUPPORT_URL } from '@/constants/links';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useCsvExportImport } from '@/features/csv/use-csv-export-import';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, language, setTheme, setLanguage } = useAppSettings();
  const { selection: complianceSelection, profile, setSelection: setComplianceSelection } =
    useComplianceProfile();
  const colors = useTheme();
  const { exportCsv, planImport, confirmImport, statusText } = useCsvExportImport();

  async function onImportCsv() {
    const dryRun = await planImport();
    if (!dryRun) return;
    if (dryRun.errors.length > 0) {
      Alert.alert(
        t('csv.importErrorsTitle'),
        t('csv.importErrors', { count: dryRun.errors.length }),
      );
      return;
    }
    const created = dryRun.plan.sessions.filter((s) => s.action === 'create').length;
    const updated = dryRun.plan.sessions.filter((s) => s.action === 'update').length;
    Alert.alert(
      t('csv.importConfirmTitle'),
      t('csv.importSummary', {
        created,
        updated,
        firearms: dryRun.plan.firearms.filter((f) => f.action === 'create').length,
        ammoLots: dryRun.plan.ammoLots.filter((a) => a.action === 'create').length,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('csv.importConfirmAction'), onPress: () => confirmImport(dryRun.groups) },
      ],
    );
  }

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
        <ThemedText type="smallBold">{t('compliance.settingsTitle')}</ThemedText>
        <SegmentedControl
          options={[
            { value: 'none' as ProfileSelection, label: t('compliance.profileNone') },
            { value: 'se' as ProfileSelection, label: t('compliance.profileSe') },
          ]}
          value={complianceSelection}
          onChange={setComplianceSelection}
          testID="compliance-profile-picker"
        />
        {profile && !profile.verified && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('compliance.unverifiedHint')}
          </ThemedText>
        )}
      </Card>

      <Card>
        <ListRow
          title={t('vault.settingsRowTitle')}
          subtitle={t('vault.settingsRowSubtitle')}
          onPress={() => router.push('/vault')}
          testID="settings-open-vault"
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('csv.sectionTitle')}</ThemedText>
        <ListRow
          title={t('csv.exportTitle')}
          subtitle={t('csv.exportSubtitle')}
          onPress={exportCsv}
          testID="settings-export-csv"
        />
        <ListRow
          title={t('csv.importTitle')}
          subtitle={t('csv.importSubtitle')}
          onPress={onImportCsv}
          testID="settings-import-csv"
        />
        {statusText ? (
          <ThemedText type="small" themeColor="textSecondary" testID="csv-status">
            {statusText}
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <ListRow
          title={t('settings.supportDevelopment')}
          subtitle={t('settings.supportSubtitle')}
          onPress={() => Linking.openURL(SUPPORT_URL)}
          testID="settings-support-development"
        />
        <ListRow
          title={t('settings.about')}
          onPress={() => router.push('/about')}
          testID="settings-about"
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
