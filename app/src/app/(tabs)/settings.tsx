import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SearchablePicker, type SearchablePickerOption } from '@/components/searchable-picker';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import {
  allMarkeThresholds,
  ageReduction,
  type MarkeGroup,
  type MarkeValor,
  type ProfileSelection,
} from '@shotledger/shared';

import { SUPPORT_URL } from '@/constants/links';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { BackupCard } from '@/features/backup/backup-card';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useCsvExportImport } from '@/features/csv/use-csv-export-import';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { Spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, language, setTheme, setLanguage } = useAppSettings();
  const {
    selection: complianceSelection,
    profile,
    setSelection: setComplianceSelection,
  } = useComplianceProfile();
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

  const [birthYear, setBirthYear] = useState<number | null>(() =>
    db ? getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null) : null,
  );

  function onChangeBirthYear(year: number) {
    setBirthYear(year);
    if (db) setSetting<number | null>(db, SETTINGS_KEYS.birthYear, year);
  }

  function onClearBirthYear() {
    setBirthYear(null);
    if (db) setSetting<number | null>(db, SETTINGS_KEYS.birthYear, null);
  }

  // Newest first, spanning ages 10-100 — plausible for a shooting license.
  const currentYear = new Date().getFullYear();
  const birthYearOptions = useMemo<SearchablePickerOption<number>[]>(() => {
    const options: SearchablePickerOption<number>[] = [];
    for (let year = currentYear - 10; year >= currentYear - 100; year--) {
      options.push({ value: year, label: String(year), testID: `birth-year-option-${year}` });
    }
    return options;
  }, [currentYear]);

  const markeThresholds = useMemo(
    () => allMarkeThresholds({ birthYear, year: currentYear }),
    [birthYear, currentYear],
  );
  const markeReduction = useMemo(
    () => ageReduction(birthYear, currentYear),
    [birthYear, currentYear],
  );
  // −1 p/series from the year after turning 55, −2 from the year after
  // turning 65 (SHB Bilaga 1 mom 5.1.1.1) — so the reduction that applies
  // today started the year the shooter turned 56 or 66, respectively.
  const markeReductionSinceYear =
    birthYear === null || markeReduction === 0
      ? null
      : birthYear + (markeReduction === 2 ? 66 : 56);
  const markeGroups: MarkeGroup[] = ['A', 'B', 'C'];
  const markeValors: MarkeValor[] = ['brons', 'silver', 'guld'];

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
        <SearchablePicker
          label={t('settings.birthYear')}
          options={birthYearOptions}
          value={birthYear}
          onChange={onChangeBirthYear}
          placeholder={t('settings.birthYearPlaceholder')}
          searchPlaceholder={t('settings.birthYearSearchPlaceholder')}
          emptyLabel={t('settings.birthYearNoMatch')}
          clearable
          clearLabel={t('common.clear')}
          onClear={onClearBirthYear}
          keyboardType="number-pad"
          testID="birth-year"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.birthYearHelp')}
        </ThemedText>

        <View style={styles.markeTable} testID="marke-requirement">
          <ThemedText type="smallBold">{t('settings.markeTitle')}</ThemedText>
          <View style={styles.markeRow}>
            <View style={styles.markeCellLabel} />
            {markeGroups.map((group) => (
              <ThemedText key={group} type="smallBold" style={styles.markeCell}>
                {group}
              </ThemedText>
            ))}
          </View>
          {markeValors.map((valor) => (
            <View key={valor} style={styles.markeRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.markeCellLabel}>
                {t(`webshooter.medal.${valor}`)}
              </ThemedText>
              {markeGroups.map((group) => (
                <ThemedText key={group} type="default" style={styles.markeCell}>
                  {markeThresholds[group][valor]}
                </ThemedText>
              ))}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {birthYear === null
              ? t('settings.markeNoYearNote')
              : markeReductionSinceYear !== null
                ? t('settings.markeReductionNote', {
                    points: markeReduction,
                    sinceYear: markeReductionSinceYear,
                  })
                : t('settings.markeReductionNoneNote')}
          </ThemedText>
        </View>
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
          title={t('account.settingsRowTitle')}
          subtitle={t('account.settingsRowSubtitle')}
          onPress={() => router.push('/account')}
          testID="settings-open-account"
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

      <BackupCard />

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
  markeTable: {
    gap: Spacing.one,
  },
  markeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  markeCellLabel: {
    flex: 2,
  },
  markeCell: {
    flex: 1,
    textAlign: 'center',
  },
});
