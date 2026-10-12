// A yes/no question in the app's own bottom-sheet chrome, in place of the
// platform alert: on Android that is a stock dialog with ALL-CAPS buttons and
// no way to mark the destructive one.
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface ConfirmContentProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Draws the confirm button in the danger colour. */
  destructive?: boolean;
  testID?: string;
}

/** The question and its two buttons, for a sheet that is already open. */
export function ConfirmContent({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  testID,
}: ConfirmContentProps) {
  const theme = useTheme();
  const tone = destructive ? theme.danger : theme.primary;

  return (
    <View style={styles.content} testID={testID}>
      <ThemedText type="default" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
      <View style={styles.buttons}>
        <SecondaryButton
          label={cancelLabel}
          onPress={onCancel}
          style={styles.button}
          testID={testID ? `${testID}-cancel` : undefined}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.button,
            styles.confirm,
            { borderColor: tone },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}
          testID={testID ? `${testID}-confirm` : undefined}
        >
          <ThemedText type="smallBold" style={{ color: tone }} numberOfLines={1}>
            {confirmLabel}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export interface ConfirmSheetProps extends ConfirmContentProps {
  visible: boolean;
}

export function ConfirmSheet({ visible, ...content }: ConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={content.onCancel}>
      <ConfirmContent {...content} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  title: {
    fontWeight: 700,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    flex: 1,
  },
  confirm: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
