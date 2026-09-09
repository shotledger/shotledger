// Open-source license list. The JavaScript half is generated from Metro's
// bundle by scripts/generate-licenses.mjs; the native half is hand-maintained
// in constants/native-licenses.ts because no npm manifest describes it.
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import licenses from '@/constants/licenses.json';
import { NATIVE_LICENSES, type NativeLicense } from '@/constants/native-licenses';
import { Spacing } from '@/theme/tokens';

function LicenseRow({ name, version, license }: NativeLicense) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" style={styles.name} numberOfLines={2}>
        {name} {version}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {license}
      </ThemedText>
    </View>
  );
}

export default function LicensesScreen() {
  const { t } = useTranslation();

  return (
    <Screen scroll={false}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('about.licensesIntro')}
      </ThemedText>

      <ThemedText type="smallBold">{t('about.licensesNativeTitle')}</ThemedText>
      <Card>
        {NATIVE_LICENSES.map((item) => (
          <LicenseRow key={item.name} {...item} />
        ))}
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        {t('about.licensesNativeNote')}
      </ThemedText>

      <ThemedText type="smallBold">{t('about.licensesJsTitle')}</ThemedText>
      <Card style={styles.card}>
        <FlatList
          data={licenses}
          keyExtractor={(item) => `${item.name}@${item.version}`}
          testID="licenses-list"
          renderItem={({ item }) => <LicenseRow {...item} />}
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
