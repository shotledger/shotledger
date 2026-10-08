// Dev-only debug route (not linked from tabs; redirected away outside dev
// builds by dev/_layout.tsx). Lets an agent or developer load/wipe the seed
// fixture and see it render without a full UI.
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { ScreenTitle } from '@/components/screen-title';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FLAGS, type FlagName, isFlagEnabled } from '@/constants/flags';
import { db } from '@/db/client';
import { clearAssistLog, getAssistLog } from '@/db/queries/assist-log';
import { setFlagOverride } from '@/db/queries/feature-flags';
import { listSessions } from '@/db/queries/sessions';
import { firearmCounterDrift } from '@/db/queries/volume';
import { seedDemoData, wipeDemoData } from '@/db/seed';
import { summarizeAssist } from '@/features/photo-scoring/assist-log';
import { shareTextFile } from '@/platform/share-file';
import { Spacing } from '@/theme/tokens';

type SessionRow = ReturnType<typeof listSessions>[number];

const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

export default function DevScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>(() => listSessions(db));
  const [drift, setDrift] = useState(() => firearmCounterDrift(db));
  const [assistLog, setAssistLog] = useState(() => getAssistLog(db));

  const [flags, setFlags] = useState(() =>
    Object.fromEntries(FLAG_NAMES.map((name) => [name, isFlagEnabled(name)])),
  );

  const onToggleFlag = useCallback((name: FlagName, next: boolean) => {
    // Back at the build value means no override, so a later build change wins.
    setFlagOverride(db, name, next === FLAGS[name].build ? null : next);
    setFlags((current) => ({ ...current, [name]: next }));
  }, []);

  const refresh = useCallback(() => {
    setSessions(listSessions(db));
    setDrift(firearmCounterDrift(db));
    setAssistLog(getAssistLog(db));
  }, []);

  const onExportAssistLog = useCallback(() => {
    void shareTextFile(JSON.stringify(assistLog, null, 2), {
      filename: `assist-log-${new Date().toISOString().slice(0, 10)}.json`,
      mimeType: 'application/json',
      uti: 'public.json',
    });
  }, [assistLog]);

  const onClearAssistLog = useCallback(() => {
    clearAssistLog(db);
    setAssistLog([]);
  }, []);

  const onLoadDemoData = useCallback(() => {
    seedDemoData(db);
    refresh();
  }, [refresh]);

  const onWipeData = useCallback(() => {
    wipeDemoData(db);
    refresh();
  }, [refresh]);

  return (
    <Screen>
      <ScreenTitle>{t('dev.title')}</ScreenTitle>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/dev/components')}
        testID="dev-components-link"
      >
        <ThemedText type="linkPrimary">{t('dev.componentsTitle')}</ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/dev/shotlog-import')}
        testID="dev-shotlog-import-link"
      >
        <ThemedText type="linkPrimary">{t('shotlog.sectionRowTitle')}</ThemedText>
      </Pressable>

      <ThemedView style={styles.actions}>
        <PrimaryButton
          label={t('settings.loadDemoData')}
          onPress={onLoadDemoData}
          testID="load-demo-data"
        />
        <PrimaryButton label={t('settings.wipeData')} onPress={onWipeData} testID="wipe-data" />
      </ThemedView>

      <ThemedText type="smallBold">{t('dev.flagsTitle')}</ThemedText>
      <Card>
        {FLAG_NAMES.map((name) => (
          <ListRow
            key={name}
            title={t(FLAGS[name].labelKey)}
            subtitle={t(FLAGS[name].descriptionKey)}
            trailing={
              <Switch
                value={flags[name]}
                disabled={!FLAGS[name].overridable}
                onValueChange={(next) => onToggleFlag(name, next)}
                testID={`dev-flag-${name}`}
              />
            }
          />
        ))}
      </Card>

      <ThemedText type="smallBold">{t('dev.assistLogTitle')}</ThemedText>
      <Card>
        {assistLog.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('dev.assistLogEmpty')}
          </ThemedText>
        ) : (
          summarizeAssist(assistLog).map((row) => (
            <ListRow
              key={row.flagsOn.join(',') || 'none'}
              title={
                row.flagsOn.length > 0
                  ? row.flagsOn
                      .map((name) => t(FLAGS[name as FlagName]?.labelKey ?? name))
                      .join(' + ')
                  : t('dev.assistLogNoFlags')
              }
              subtitle={t('dev.assistLogRow', {
                count: row.series,
                suggested: row.counts.suggested,
                kept: row.counts.kept,
                nudged: row.counts.nudged,
                deleted: row.counts.deleted,
                added: row.counts.added,
                precision: percent(row.precision),
                recall: percent(row.recall),
              })}
              testID={`dev-assist-${row.flagsOn.join('-') || 'none'}`}
            />
          ))
        )}
      </Card>
      <ThemedView style={styles.actions}>
        <SecondaryButton
          label={t('dev.assistLogExport')}
          onPress={onExportAssistLog}
          disabled={assistLog.length === 0}
          testID="dev-assist-export"
        />
        <SecondaryButton
          label={t('dev.assistLogClear')}
          onPress={onClearAssistLog}
          disabled={assistLog.length === 0}
          testID="dev-assist-clear"
        />
      </ThemedView>

      {drift.length > 0 && (
        <>
          <ThemedText type="smallBold">{t('dev.driftTitle')}</ThemedText>
          <ThemedText type="small">{t('dev.driftSubtitle')}</ThemedText>
          <Card>
            {drift.map((row) => (
              <ListRow
                key={row.firearmId}
                title={`${row.make} ${row.model}`.trim()}
                trailing={
                  <ThemedText type="small">
                    {t('dev.driftRounds', { count: row.rounds })}
                  </ThemedText>
                }
                testID={`dev-drift-${row.firearmId}`}
              />
            ))}
          </Card>
        </>
      )}

      <ThemedText type="smallBold">{t('dev.sessionsCount', { count: sessions.length })}</ThemedText>

      <ThemedView style={styles.list}>
        {sessions.map((item) => (
          <ThemedView key={item.id} type="backgroundElement" style={styles.row}>
            <ThemedText type="small">{item.name}</ThemedText>
            <ThemedText type="small">
              {item.type} · {item.disciplineId} · {item.startedAt.slice(0, 10)}
            </ThemedText>
          </ThemedView>
        ))}
      </ThemedView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
