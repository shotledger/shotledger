// Open-source license list. The JavaScript half is generated from Metro's
// bundle by scripts/generate-licenses.mjs; the native half is hand-maintained
// in constants/native-licenses.ts because no npm manifest describes it.
//
// One FlatList owns the whole screen, with everything above the ~97 JS
// packages as its header. Nesting that list inside a scrolling Screen would
// give two competing scroll surfaces — which is what this screen used to do,
// and the JS half ended up scrolling inside a short box (#138).
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import licenses from '@/constants/licenses.json';
import { NATIVE_LICENSES, type NativeLicense } from '@/constants/native-licenses';
import { Radius, Spacing } from '@/theme/tokens';

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
      <FlatList
        data={licenses}
        keyExtractor={(item) => `${item.name}@${item.version}`}
        testID="licenses-list"
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => (
          <ThemedView
            type="backgroundElement"
            style={[
              styles.jsRow,
              index === 0 && styles.jsFirst,
              index === licenses.length - 1 && styles.jsLast,
            ]}
          >
            <LicenseRow {...item} />
          </ThemedView>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
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
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, paddingBottom: Spacing.two },
  content: { paddingBottom: Spacing.four },
  // The JS rows are individual list items, so the card surface is painted
  // per row and only the outer corners are rounded — together they read as
  // the one Card this section used to be.
  jsRow: { paddingHorizontal: Spacing.three },
  jsFirst: {
    borderTopLeftRadius: Radius.medium,
    borderTopRightRadius: Radius.medium,
    paddingTop: Spacing.two,
  },
  jsLast: {
    borderBottomLeftRadius: Radius.medium,
    borderBottomRightRadius: Radius.medium,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: { flexShrink: 1 },
});
