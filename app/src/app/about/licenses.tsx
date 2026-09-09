// Open-source license list. The data is generated from the lockfile by
// scripts/generate-licenses.mjs; `pnpm licenses:check` fails on drift.
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import licenses from '@/constants/licenses.json';
import { Spacing } from '@/theme/tokens';

export default function LicensesScreen() {
  const { t } = useTranslation();

  return (
    <Screen scroll={false}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('about.licensesIntro')}
      </ThemedText>

      <Card style={styles.card}>
        <FlatList
          data={licenses}
          keyExtractor={(item) => `${item.name}@${item.version}`}
          testID="licenses-list"
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ThemedText type="small" style={styles.name} numberOfLines={2}>
                {item.name} {item.version}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.license}
              </ThemedText>
            </View>
          )}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: { flexShrink: 1 },
});
