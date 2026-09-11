// The heading at the top of a screen.
//
// There were four sizes doing this job: `ThemedText type="title"` at 48,
// Home at 28, /dev at 24/28 and the session detail screen at 24/30 — so
// screens at the same level of the app shouted at different volumes
// (maintainer, 2026-09-11: "compare eg home, statistics and tools").
//
// The session screen's size won, because it is the one screen whose title
// sits above dense content and had already been tuned by hand. Everything
// routes through here now, so the next change to it is one line.
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface ScreenTitleProps {
  children: ReactNode;
  testID?: string;
}

export function ScreenTitle({ children, testID }: ScreenTitleProps) {
  return (
    <ThemedText type="subtitle" style={styles.title} testID={testID}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
});
