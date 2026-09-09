// An [i] next to a control, opening its long explanation in a sheet. Neither
// Android nor iOS has a cross-platform tooltip, and the maintainer asked for
// this instead (2026-09-09) so reference prose stops sitting permanently
// expanded under every switch it belongs to.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { InfoIcon } from '@/components/icons';
import { toParagraphs } from '@/components/info-sheet-body';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface InfoButtonProps {
  /** What the explanation is about — the sheet's header and the a11y label. */
  title: string;
  /** Blank lines separate paragraphs; see `info-sheet-body.ts`. */
  body: string;
  testID?: string;
}

const ICON_SIZE = 20;
// The icon's own box stays small so a section header does not become 48dp
// tall; hitSlop takes the touch target the rest of the way there.
const ICON_PADDING = Spacing.one;
const HIT_SLOP = (48 - ICON_SIZE - 2 * ICON_PADDING) / 2;

export function InfoButton({ title, body, testID }: InfoButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.infoAbout', { subject: title })}
        hitSlop={HIT_SLOP}
        onPress={() => setVisible(true)}
        testID={testID}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <InfoIcon color={theme.textSecondary} size={ICON_SIZE} />
      </Pressable>
      <BottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={title}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        {toParagraphs(body).map((paragraph) => (
          <ThemedText key={paragraph} type="default" style={styles.paragraph}>
            {paragraph}
          </ThemedText>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setVisible(false)}
          style={styles.close}
          testID={testID ? `${testID}-sheet-close` : undefined}
        >
          <ThemedText type="default" themeColor="primary">
            {t('common.close')}
          </ThemedText>
        </Pressable>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: ICON_PADDING,
    borderRadius: Radius.pill,
  },
  paragraph: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  close: {
    // Material's 48dp minimum touch target, not a spacing value.
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
