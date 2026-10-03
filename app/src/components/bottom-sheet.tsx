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
      <View style={styles.root}>
        {/* A sibling of the panel, not its parent, so the panel is not a button inside a button. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <SafeAreaView edges={['bottom']} pointerEvents="box-none">
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
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
