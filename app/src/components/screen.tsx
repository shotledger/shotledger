import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/theme/tokens';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Default true. */
  scroll?: boolean;
}

/** Standard screen shell: safe area, max content width, bottom tab-bar clearance. */
export function Screen({ children, scroll = true, style, ...rest }: ScreenProps) {
  const Content = scroll ? ScrollView : View;
  const contentProps = scroll
    ? { contentContainerStyle: styles.scrollContent }
    : { style: styles.plainContent };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Content {...contentProps}>
          <View style={[styles.inner, !scroll && styles.innerFlex, style]} {...rest}>
            {children}
          </View>
        </Content>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
  },
  plainContent: {
    flex: 1,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    // An absolutely-positioned child (the FAB) resolves `bottom` against this
    // view, so it has to fill the viewport when the content is shorter —
    // otherwise the FAB rides up into the list. See components/fab.tsx.
    flexGrow: 1,
  },
  innerFlex: {
    flex: 1,
  },
});
