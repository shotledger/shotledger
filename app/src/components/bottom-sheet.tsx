// The modal chrome every bottom sheet in the app shares: dimmed backdrop,
// bottom-anchored panel, hardware-Back close. Extracted from action-sheet.tsx
// so a sheet of prose reuses that mechanism instead of adding a second one.
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/tokens';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Names the modal; the backdrop takes `${testID}-backdrop`. */
  testID?: string;
}

export function BottomSheet({ visible, onClose, title, children, testID }: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        testID={testID ? `${testID}-backdrop` : undefined}
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
              {children}
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
  bottomSpacer: {
    height: Spacing.two,
  },
});
