// Blocks the app once an evaluation build has expired. Inert unless the build
// sets EXPO_PUBLIC_EVAL_EXPIRES_AT.
import Constants from 'expo-constants';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { EVAL_EXPIRES_AT } from '@/constants/flags';
import { getEvalHighWaterMark, setEvalHighWaterMark } from '@/platform/secure-store';
import { Spacing } from '@/theme/tokens';
import { useDateFormat } from '@/features/dates/use-date-format';
import { useJsonExportImport } from '@/features/json-export/use-json-export-import';

import { evaluateEvaluationWindow, type EvaluationStatus } from './expiry';

export function EvaluationGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EvaluationStatus | null>(() =>
    EVAL_EXPIRES_AT === undefined ? { kind: 'none' } : null,
  );

  useEffect(() => {
    if (EVAL_EXPIRES_AT === undefined) return;
    let cancelled = false;
    async function check() {
      const next = evaluateEvaluationWindow({
        expiresAt: EVAL_EXPIRES_AT,
        now: Date.now(),
        highWaterMark: await getEvalHighWaterMark(),
      });
      if (next.kind !== 'none') await setEvalHighWaterMark(next.highWaterMark);
      if (!cancelled) setStatus(next);
    }
    void check();
    // Also on returning to the app, so one left open does not outlive the date.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  if (status === null) return null;
  if (status.kind === 'expired') return <ExpiredScreen expiresAt={status.expiresAt} />;
  return children;
}

function ExpiredScreen({ expiresAt }: { expiresAt: number }) {
  const { t } = useTranslation();
  const date = useDateFormat().date(expiresAt);
  // The logbook is the tester's: an expired build blocks new use, never their
  // way out with the data.
  const { exportJson, statusText } = useJsonExportImport(Constants.expoConfig?.version ?? '0.0.0');

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <ThemedText type="subtitle" style={styles.center}>
          {t('evaluation.expiredTitle')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('evaluation.expiredBody', { date })}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('evaluation.expiredExportNote')}
        </ThemedText>
        <Card>
          <ListRow
            title={t('jsonExport.exportTitle')}
            subtitle={t('jsonExport.exportSubtitle')}
            onPress={() => void exportJson()}
            testID="evaluation-expired-export"
          />
          {statusText !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {statusText}
            </ThemedText>
          )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  center: { textAlign: 'center' },
});
