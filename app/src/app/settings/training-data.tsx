// Settings → Improve Automatic Scoring. The opt-in that keeps tap-to-mark
// positions as training data for a future learned hole detector (#174), the
// count that makes the promise checkable, and the delete that makes the
// consent revocable.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { countTrainingSamples, deleteAllTrainingSamples } from '@/db/queries/training-samples';
import { Spacing } from '@/theme/tokens';

export default function TrainingDataSettingsScreen() {
  const { t } = useTranslation();

  const [trainingConsent, setTrainingConsent] = useState(() =>
    getSetting<boolean>(db, SETTINGS_KEYS.photoTrainingConsent, false),
  );
  const [sampleCount, setSampleCount] = useState(() => countTrainingSamples(db));

  function onToggleTrainingConsent(next: boolean) {
    setTrainingConsent(next);
    setSetting<boolean>(db, SETTINGS_KEYS.photoTrainingConsent, next);
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
            deleteAllTrainingSamples(db);
            setSampleCount(0);
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.trainingTitle') }} />
      <ScreenTitle>{t('settings.trainingTitle')}</ScreenTitle>

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
          <Toggle
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
