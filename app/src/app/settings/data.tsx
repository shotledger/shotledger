// Settings → Backup & Data. The encrypted backup card plus the JSON
// export/import pair.
//
// Not one of the groups the maintainer enumerated on #138, but the rule they
// gave — nothing operated directly under Settings — applies to these two
// cards as much as to the switches, and both answer the same question ("get
// my logbook out, put it back").
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { BackupCard } from '@/features/backup/backup-card';
import { useJsonExportImport } from '@/features/json-export/use-json-export-import';

export default function DataSettingsScreen() {
  const { t } = useTranslation();
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

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.dataTitle') }} />
      <ScreenTitle>{t('settings.dataTitle')}</ScreenTitle>

      <BackupCard />

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
    </Screen>
  );
}
