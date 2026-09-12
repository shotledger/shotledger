import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { DEV_TOOLS_ENABLED } from '@/constants/dev-tools';
import { PROVIDERS } from '@shotledger/shared/src/integrations/providers/registry';
import type { SkillClass } from '@shotledger/shared/src/disciplines/eligibility';
import { effectiveRegulations } from '@shotledger/shared/src/regulations/registry';

import { DrillDownRow } from '@/components/drill-down-row';
import { ProviderSettingsRow } from '@/features/providers/provider-settings-row';
import { useRegulations } from '@/features/regulations/use-regulations';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
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
import { countTrainingSamples, deleteAllTrainingSamples } from '@/db/queries/training-samples';
import { BackupCard } from '@/features/backup/backup-card';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useJsonExportImport } from '@/features/json-export/use-json-export-import';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { Spacing } from '@/theme/tokens';

/** 1, 2, 3 — the 1u/1b/1s variants are deliberately not offered (SHB F.2.5). */
const SKILL_CLASS_OPTIONS: readonly SkillClass[] = ['1', '2', '3'];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, language, setTheme, setLanguage } = useAppSettings();
  const [skillClass, setSkillClass] = useState<SkillClass | null>(() =>
    db ? getSetting<SkillClass | null>(db, SETTINGS_KEYS.skillClass, null) : null,
  );
  const [womensClasses, setWomensClasses] = useState<boolean>(() =>
    db ? getSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, false) : false,
  );

  function onChangeSkillClass(next: SkillClass) {
    setSkillClass(next);
    if (db) setSetting<SkillClass>(db, SETTINGS_KEYS.skillClass, next);
  }

  function onChangeWomensClasses(next: boolean) {
    setWomensClasses(next);
    if (db) setSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, next);
  }
  // The short names of everything in effect, adoption included — "SPSF, ISSF,
  // SvSF" rather than only what has a switch turned on.
  const { enabled: enabledRegulations } = useRegulations();
  const effective = effectiveRegulations(enabledRegulations);
  const activeRegulationSummary =
    effective.length === 0
      ? t('regulations.settingsRowNone')
      : effective.map((regulation) => regulation.shortName).join(' · ');
  const {
    selection: complianceSelection,
    profile,
    setSelection: setComplianceSelection,
  } = useComplianceProfile();
  const { exportJson, planImport, confirmImport, statusText } = useJsonExportImport(
    Constants.expoConfig?.version ?? '0.0.0',
  );

  async function onImportJson() {
    const dryRun = await planImport();
    if (!dryRun) return;
    if (dryRun.errors.length > 0) {
      Alert.alert(
        t('jsonExport.importErrorsTitle'),
        t('jsonExport.importErrors', { count: dryRun.errors.length }),
      );
      return;
    }
    const created = dryRun.plan.sessions.filter((s) => s.action === 'create').length;
    const updated = dryRun.plan.sessions.filter((s) => s.action === 'update').length;
    Alert.alert(
      t('jsonExport.importConfirmTitle'),
      t('jsonExport.importSummary', {
        created,
        updated,
        firearms: dryRun.plan.firearms.filter((f) => f.action === 'create').length,
        ammoLots: dryRun.plan.ammoLots.filter((a) => a.action === 'create').length,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('jsonExport.importConfirmAction'), onPress: () => confirmImport(dryRun.groups) },
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

  // Opt-in online place lookup for the session Location field. Off by default:
  // when on, what the user types there is sent to photon.komoot.io.
  const [onlineLocationLookup, setOnlineLocationLookup] = useState(() =>
    db ? getSetting<boolean>(db, SETTINGS_KEYS.onlineLocationLookup, false) : false,
  );

  // Opt-in collection of tap-to-mark positions as training data for a future
  // learned hole detector. Off by default; the count is what makes the
  // promise checkable, and the delete is what makes the consent revocable.
  const [trainingConsent, setTrainingConsent] = useState(() =>
    db ? getSetting<boolean>(db, SETTINGS_KEYS.photoTrainingConsent, false) : false,
  );
  const [sampleCount, setSampleCount] = useState(() => (db ? countTrainingSamples(db) : 0));

  function onToggleTrainingConsent(next: boolean) {
    setTrainingConsent(next);
    if (db) setSetting<boolean>(db, SETTINGS_KEYS.photoTrainingConsent, next);
  }

  function onDeleteTrainingSamples() {
    Alert.alert(
      t('settings.trainingDeleteTitle'),
      t('settings.trainingDeleteBody', { count: sampleCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.trainingDelete'),
          style: 'destructive',
          onPress: () => {
            if (db) deleteAllTrainingSamples(db);
            setSampleCount(0);
          },
        },
      ],
    );
  }

  function onToggleOnlineLocationLookup(next: boolean) {
    setOnlineLocationLookup(next);
    if (db) setSetting<boolean>(db, SETTINGS_KEYS.onlineLocationLookup, next);
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
      <ScreenTitle>{t('settings.title')}</ScreenTitle>

      <Card>
        <ThemedText type="smallBold">{t('settings.language')}</ThemedText>
        <SegmentedControl options={languageOptions} value={language} onChange={setLanguage} />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('settings.theme')}</ThemedText>
        <SegmentedControl options={themeOptions} value={theme} onChange={setTheme} />
      </Card>

      <Card>
        {/* Set once (maintainer, 2026-09-12). A birth year is a fact rather
            than a preference, and the veteran classes and märke thresholds it
            drives are retrospective — changing it silently rewrites which
            class past sessions were shot in. Once recorded it is shown, not
            offered. */}
        {birthYear === null ? (
          <>
            <SearchablePicker
              label={t('settings.birthYear')}
              options={birthYearOptions}
              value={birthYear}
              onChange={onChangeBirthYear}
              placeholder={t('settings.birthYearPlaceholder')}
              searchPlaceholder={t('settings.birthYearSearchPlaceholder')}
              emptyLabel={t('settings.birthYearNoMatch')}
              keyboardType="number-pad"
              testID="birth-year"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.birthYearHelp')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.birthYearSetOnce')}
            </ThemedText>
          </>
        ) : (
          <>
            <ListRow
              title={t('settings.birthYear')}
              subtitle={t('settings.birthYearLocked')}
              trailing={
                <ThemedText type="smallBold" testID="birth-year-value">
                  {String(birthYear)}
                </ThemedText>
              }
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.birthYearHelp')}
            </ThemedText>
          </>
        )}

        {/* The two facts that cannot be derived. Everything else about which
            klasser the shooter may enter falls out of the birth year above —
            Jun, Vet Y and Vet Ä are all year-based in both federations. */}
        <OptionPicker
          label={t('settings.skillClass')}
          options={SKILL_CLASS_OPTIONS.map((value) => ({ value, label: value }))}
          value={skillClass}
          onChange={onChangeSkillClass}
        />
        <ListRow
          title={t('settings.womensClasses')}
          subtitle={t('settings.womensClassesHelp')}
          trailing={
            <Switch
              value={womensClasses}
              onValueChange={onChangeWomensClasses}
              testID="womens-classes"
            />
          }
        />

        <View style={styles.markeTable} testID="marke-requirement">
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.headerLabel}>
              {t('settings.markeTitle')}
            </ThemedText>
            <InfoButton
              title={t('settings.markeTitle')}
              body={t('settings.markeInfo')}
              testID="marke-info"
            />
          </View>
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
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('settings.locationLookup')}
          </ThemedText>
          <InfoButton
            title={t('settings.locationLookup')}
            body={t('settings.locationLookupInfo')}
            testID="location-lookup-info"
          />
        </View>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('settings.locationLookupOnline')}</ThemedText>
          <Switch
            value={onlineLocationLookup}
            onValueChange={onToggleOnlineLocationLookup}
            testID="online-location-lookup"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.locationLookupHelp')}
        </ThemedText>
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('settings.trainingTitle')}
          </ThemedText>
          <InfoButton
            title={t('settings.trainingTitle')}
            body={t('settings.trainingInfo')}
            testID="photo-training-info"
          />
        </View>
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('settings.trainingConsent')}</ThemedText>
          <Switch
            value={trainingConsent}
            onValueChange={onToggleTrainingConsent}
            testID="photo-training-consent"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.trainingHelp')}
        </ThemedText>
        {sampleCount > 0 && (
          <>
            <ThemedText type="small" themeColor="textSecondary" testID="training-sample-count">
              {t('settings.trainingCount', { count: sampleCount })}
            </ThemedText>
            <PrimaryButton
              label={t('settings.trainingDelete')}
              onPress={onDeleteTrainingSamples}
              testID="training-delete"
            />
          </>
        )}
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

      {/* Which rule sets are in play. The row shows the answer without
          opening anything — a setting you check more often than you change. */}
      <Card>
        <DrillDownRow
          title={t('regulations.settingsRowTitle')}
          subtitle={activeRegulationSummary}
          onPress={() => router.push('/regulations')}
          testID="settings-open-regulations"
        />
      </Card>

      <Card>
        <DrillDownRow
          title={t('account.settingsRowTitle')}
          subtitle={t('account.settingsRowSubtitle')}
          onPress={() => router.push('/account')}
          testID="settings-open-account"
        />
      </Card>

      {/* External sites (ADR 0010): enabling one is a preference, and
          connecting to it is a credential — both belong here rather than in
          Tools, which is for using them. */}
      <Card>
        <ThemedText type="smallBold">{t('providers.sectionTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('providers.settingsHint')}
        </ThemedText>
      </Card>

      {/* One card per site. Sharing a card made two sites read as one
          settings block with two switches in it, and a connected site's
          credentials and calendar row ran straight into the next site's
          name (maintainer, 2026-09-11). */}
      {PROVIDERS.map((provider) => (
        <Card key={provider.id}>
          <ProviderSettingsRow provider={provider} />
        </Card>
      ))}

      <Card>
        <ThemedText type="smallBold">{t('jsonExport.sectionTitle')}</ThemedText>
        <ListRow
          title={t('jsonExport.exportTitle')}
          subtitle={t('jsonExport.exportSubtitle')}
          onPress={exportJson}
          testID="settings-export-json"
        />
        <ListRow
          title={t('jsonExport.importTitle')}
          subtitle={t('jsonExport.importSubtitle')}
          onPress={onImportJson}
          testID="settings-import-json"
        />
        {statusText ? (
          <ThemedText type="small" themeColor="textSecondary" testID="json-export-status">
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
        <DrillDownRow
          title={t('settings.about')}
          onPress={() => router.push('/about')}
          testID="settings-about"
        />
      </Card>

      {/* The only tap-path to /dev. A dev build reaches it by deep link, but a
          sideloaded release build built with EXPO_PUBLIC_ENABLE_DEV_TOOLS=1
          cannot — and that build exists so the maintainer can load demo data
          on a phone. */}
      {DEV_TOOLS_ENABLED && (
        <Card>
          <DrillDownRow
            title={t('settings.devSection')}
            onPress={() => router.push('/dev')}
            testID="settings-open-dev"
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexShrink: 1,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
