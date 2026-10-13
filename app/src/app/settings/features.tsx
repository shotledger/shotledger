// Settings → Features (#801, docs/specs/feature-visibility-spec.md). A switch
// per optional area. Off removes the area's ways in; nothing is deleted. See
// features/settings/feature-visibility.ts.
import { FEATURE_IDS } from '@shotledger/shared';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { setFeatureVisible, useFeatures } from '@/features/settings/feature-visibility';
import { Spacing } from '@/theme/tokens';

export default function FeaturesSettingsScreen() {
  const { t } = useTranslation();
  const features = useFeatures();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.featuresTitle') }} />
      <ScreenTitle>{t('settings.featuresTitle')}</ScreenTitle>
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.featuresIntro')}
      </ThemedText>

      {FEATURE_IDS.map((id) => (
        <Card key={id}>
          <View style={styles.switchRow}>
            <ThemedText type="smallBold" style={styles.label}>
              {t(`settings.feature.${id}`)}
            </ThemedText>
            <Switch
              value={features[id]}
              onValueChange={(next) => setFeatureVisible(id, next)}
              testID={`feature-${id}`}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`settings.featureHint.${id}`)}
          </ThemedText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  label: {
    flexShrink: 1,
  },
});
