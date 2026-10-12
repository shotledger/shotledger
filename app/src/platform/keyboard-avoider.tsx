// Keeps a focused field above the soft keyboard (§0 rule 6, #744). Android
// draws edge to edge, so the window no longer resizes for the keyboard: pad
// the scroll view by the keyboard's height and Android's ScrollView scrolls
// the focused field back into view. iOS scroll views do it themselves through
// `automaticallyAdjustKeyboardInsets`, so this is a pass-through there.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

export function KeyboardAvoider({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      enabled={Platform.OS === 'android'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
