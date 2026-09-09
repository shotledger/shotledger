// Material-style bottom sheet of actions — used for the session overflow
// menu. Modal mechanics follow the existing dialogs in
// `app/src/features/backup/` (backdrop + `onRequestClose`); the panel itself
// is anchored to the bottom rather than centred.
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/tokens';

export interface ActionSheetAction {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: readonly ActionSheetAction[];
}

export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  function select(action: ActionSheetAction) {
    if (action.disabled) return;
    onClose();
    action.onPress();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="action-sheet"
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        testID="action-sheet-backdrop"
      >
        {/* Swallows the touch so tapping the panel doesn't fall through to the backdrop above. */}
        <Pressable onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <ThemedView type="backgroundElement" style={styles.panel}>
              {title ? (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
                  {title}
                </ThemedText>
              ) : null}
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
                    themeColor={
                      action.disabled ? 'textSecondary' : action.destructive ? 'danger' : undefined
                    }
                  >
                    {action.label}
                  </ThemedText>
                </Pressable>
              ))}
              <View style={styles.bottomSpacer} />
            </ThemedView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  title: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  bottomSpacer: {
    height: Spacing.two,
  },
});
