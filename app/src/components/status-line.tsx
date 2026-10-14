// Status Line (#822, DESIGN.md "Status Line"): a licence's status in words,
// with a dot in the semantic colour beside them. Colour is the second
// signal, never the only one — "Expiring Soon" reads the same in
// greyscale. Presentational: the caller works the status out
// (`licenseStatus` in @shotledger/shared) and passes it in.
import { StyleSheet, View } from 'react-native';
import type { LicenseStatus } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing, type ThemeColor } from '@/theme/tokens';

export interface StatusLineProps {
  status: LicenseStatus;
  /** What the status is about or until when ("Valid until 2027-03-01"), after the words. */
  detail?: string;
  testID?: string;
}

/** The semantic token each status draws in. */
export const STATUS_LINE_TONE: Record<LicenseStatus, ThemeColor> = {
  valid: 'success',
  expiringSoon: 'warning',
  expired: 'danger',
  none: 'textSecondary',
};

/** The words for each status: the firearm list's own strings, so both say the same. */
export const STATUS_LINE_KEY = {
  valid: 'firearms.licenseStatusValid',
  expiringSoon: 'firearms.licenseStatusExpiringSoon',
  expired: 'firearms.licenseStatusExpired',
  none: 'firearms.licenseStatusNone',
} as const satisfies Record<LicenseStatus, string>;

export function StatusLine({ status, detail, testID }: StatusLineProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const tone = STATUS_LINE_TONE[status];
  const words = t(STATUS_LINE_KEY[status]);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={detail ? `${words}, ${detail}` : words}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: theme[tone] }]} />
      <ThemedText type="smallBold" themeColor={tone}>
        {words}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.detail}>
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  detail: {
    flexShrink: 1,
  },
});
