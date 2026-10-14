// Home's licence status, in words (#822, direction A: "lead with the licence
// status in words"). The Status Line shape — a dot in the semantic colour,
// the words in Label Strong, a detail after them — over the licence-activity
// status rather than a firearm licence's validity, which is what
// `StatusLine` is typed to. Colour is the second signal; the words carry it.
import type { LicenseActivityStatus } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing, type ThemeColor } from '@/theme/tokens';

const TONE: Record<LicenseActivityStatus, ThemeColor> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

const WORDS = {
  green: 'compliance.licenseActivityGreen',
  amber: 'compliance.licenseActivityAmber',
  red: 'compliance.licenseActivityRed',
} as const satisfies Record<LicenseActivityStatus, string>;

export interface LicenseActivityLineProps {
  status: LicenseActivityStatus;
  /** "Next session by 31 Mar 2027 to stay On Track.", when there is a date. */
  detail: string | null;
  onPress: () => void;
  testID?: string;
}

export function LicenseActivityLine({ status, detail, onPress, testID }: LicenseActivityLineProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tone = TONE[status];
  const title = t('compliance.licenseActivityTitle');
  const words = t(WORDS[status]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`${title}: ${words}`, detail].filter(Boolean).join('. ')}
      accessibilityHint={t('compliance.check.open')}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.block, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: theme[tone] }]} />
        <ThemedText type="small" themeColor="textSecondary">
          {title}
        </ThemedText>
        <ThemedText type="smallBold" themeColor={tone} testID={testID && `${testID}-status`}>
          {words}
        </ThemedText>
      </View>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary" testID={testID && `${testID}-detail`}>
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.half,
    minHeight: 48,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: Spacing.two,
    height: Spacing.two,
    borderRadius: Radius.pill,
  },
  pressed: { opacity: 0.6 },
});
