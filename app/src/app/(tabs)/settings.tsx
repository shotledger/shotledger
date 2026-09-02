import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import type { ProfileSelection } from '@shotledger/shared';

import { SUPPORT_URL } from '@/constants/links';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { useBackupExportImport } from '@/features/backup/use-backup-export-import';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useCsvExportImport } from '@/features/csv/use-csv-export-import';
import { useWebShooterConnection } from '@/features/webshooter/use-webshooter-connection';
import { useAppSettings, type LanguageSetting, type ThemeSetting } from '@/state/app-settings';
import { useTheme } from '@/hooks/use-theme';
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
  const colors = useTheme();
  const { exportCsv, planImport, confirmImport, statusText } = useCsvExportImport();
  const {
    exportBundle,
    planRestore,
    confirmRestore,
    statusText: backupStatusText,
    lastBackupAt,
  } = useBackupExportImport();
  const webshooter = useWebShooterConnection();
  const [wsUsername, setWsUsername] = useState('');
  const [wsPassword, setWsPassword] = useState('');
  const [wsToken, setWsToken] = useState('');
  const [devMockEnabled, setDevMockEnabled] = useState(() =>
    db ? getSetting<boolean>(db, 'webshooterDevMock', false) : false,
  );

  function onToggleDevMock(next: boolean) {
    setDevMockEnabled(next);
    if (db) setSetting<boolean>(db, 'webshooterDevMock', next);
  }

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

  async function onRestoreBundle() {
    const planned = await planRestore();
    if (!planned) return;
    const { manifest } = planned.preview;
    const photosNote =
      manifest.kind === 'database+photos'
        ? t('backup.restorePreviewPhotosNote', { count: manifest.counts.photos })
        : '';
    Alert.alert(
      t('backup.restorePreviewTitle'),
      t('backup.restorePreviewBody', {
        date: new Date(manifest.createdAt).toLocaleDateString(),
        sessions: manifest.counts.sessions,
        series: manifest.counts.series,
        shots: manifest.counts.shots,
        firearms: manifest.counts.firearms,
        photosNote,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('backup.restoreConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void confirmRestore(planned.bytes).then(() => {
              Alert.alert(t('backup.restoreRestartTitle'), t('backup.restoreRestartBody'), [
                { text: t('backup.restoreRestartAction') },
              ]);
            });
          },
        },
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
          title={t('account.settingsRowTitle')}
          subtitle={t('account.settingsRowSubtitle')}
          onPress={() => router.push('/account')}
          testID="settings-open-account"
        />
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
        <ThemedText type="smallBold">{t('backup.sectionTitle')}</ThemedText>
        <ListRow
          title={t('backup.exportDbTitle')}
          subtitle={t('backup.exportDbSubtitle')}
          onPress={() => void exportBundle('database')}
          testID="settings-export-backup-db"
        />
        <ListRow
          title={t('backup.exportPhotosTitle')}
          subtitle={t('backup.exportPhotosSubtitle')}
          onPress={() => void exportBundle('database+photos')}
          testID="settings-export-backup-photos"
        />
        <ListRow
          title={t('backup.restoreTitle')}
          subtitle={t('backup.restoreSubtitle')}
          onPress={() => void onRestoreBundle()}
          testID="settings-restore-backup"
        />
        <ThemedText type="small" themeColor="textSecondary" testID="backup-last-backup">
          {lastBackupAt
            ? t('backup.lastBackup', { date: new Date(lastBackupAt).toLocaleString() })
            : t('backup.neverBackedUp')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('backup.vaultNote')}
        </ThemedText>
        {backupStatusText ? (
          <ThemedText type="small" themeColor="textSecondary" testID="backup-status">
            {backupStatusText}
          </ThemedText>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('webshooter.sectionTitle')}</ThemedText>
        {webshooter.connected ? (
          <>
            <ThemedText type="default" testID="webshooter-identity">
              {t('webshooter.connectedAs', { cardNumber: webshooter.cardNumber ?? '—' })}
            </ThemedText>
            <PrimaryButton
              label={t('webshooter.disconnect')}
              onPress={() => void webshooter.disconnect()}
              testID="webshooter-disconnect"
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('webshooter.connectHelp')}
            </ThemedText>
            <TextInput
              value={wsUsername}
              onChangeText={setWsUsername}
              placeholder={t('webshooter.usernamePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-username"
            />
            <TextInput
              value={wsPassword}
              onChangeText={setWsPassword}
              placeholder={t('webshooter.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-password"
            />
            <PrimaryButton
              label={t('webshooter.connectWithPassword')}
              onPress={() => void webshooter.connectWithPassword(wsUsername, wsPassword)}
              testID="webshooter-connect-password"
            />
            {webshooter.error === 'spaLoginNotVerified' && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.spaLoginNotVerified')}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {t('webshooter.tokenFallbackHelp')}
            </ThemedText>
            <TextInput
              value={wsToken}
              onChangeText={setWsToken}
              placeholder={t('webshooter.tokenPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-token"
            />
            <PrimaryButton
              label={t('webshooter.connectWithToken')}
              onPress={() => void webshooter.connectWithToken(wsToken)}
              testID="webshooter-connect-token"
            />
            {webshooter.error === 'connectFailed' && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.connectFailed')}
              </ThemedText>
            )}
          </>
        )}
        <ListRow
          title={t('webshooter.importTitle')}
          subtitle={t('webshooter.importSubtitle')}
          onPress={() => router.push('/webshooter/import')}
          testID="webshooter-open-import"
        />
        <ListRow
          title={t('webshooter.startsTitle')}
          subtitle={t('webshooter.startsSubtitle')}
          onPress={() => router.push('/webshooter/starts')}
          testID="webshooter-open-starts"
        />
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
            <ListRow
              title={t('webshooter.devMockTitle')}
              subtitle={t('webshooter.devMockSubtitle')}
              trailing={
                <Switch
                  value={devMockEnabled}
                  onValueChange={onToggleDevMock}
                  testID="webshooter-dev-mock-toggle"
                />
              }
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
