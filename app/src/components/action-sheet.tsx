// Material-style bottom sheet of actions — used for the session overflow
// menu. The modal chrome lives in `bottom-sheet.tsx`; this file is only the
// action rows.
import { Pressable, StyleSheet } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { CheckIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export interface ActionSheetAction {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Marks the choice already in effect, for a sheet used as a picker. */
  selected?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: readonly ActionSheetAction[];
}

export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  const theme = useTheme();

  function select(action: ActionSheetAction) {
    if (action.disabled) return;
    onClose();
    action.onPress();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} testID="action-sheet">
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled }}
          onPress={() => select(action)}
          style={styles.row}
          testID={`action-sheet-${action.key}`}
        >
          <ThemedText
            type="default"
            style={styles.rowLabel}
            themeColor={
              action.disabled
                ? 'textSecondary'
                : action.destructive
                  ? 'danger'
                  : action.selected
                    ? 'primary'
                    : undefined
            }
          >
            {action.label}
          </ThemedText>
          {action.selected ? <CheckIcon color={theme.primary} size={20} /> : null}
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowLabel: {
    flexShrink: 1,
  },
});
