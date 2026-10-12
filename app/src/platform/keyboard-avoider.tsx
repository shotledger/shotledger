// Keeps a focused field above the soft keyboard (§0 rule 6, #744). Android
// draws edge to edge, so the window no longer resizes for the keyboard: pad
// the scroll view by the keyboard's height and Android's ScrollView scrolls
// the focused field back into view. iOS scroll views do it themselves through
// `automaticallyAdjustKeyboardInsets`, so this is a pass-through there.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

export function KeyboardAvoider({ children }: { children: ReactNode }) {
  // KeyboardAvoidingView measures itself relative to its parent, so under a
  // stack header it under-pads by the header's height. Its window offset fills
  // that gap.
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setOffset(y));
  }, []);

  return (
    <View ref={ref} style={styles.fill} onLayout={onLayout} collapsable={false}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior="padding"
        keyboardVerticalOffset={offset}
        enabled={Platform.OS === 'android'}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
