// The title of a screen: one per screen, never two (#822, finding "Repeated
// labels and double titles").
//
// A screen pushed onto the root stack already has a header bar, and it used
// to carry a generic word ("Session", "Firearm") with the real name repeated
// in large type under it: two rows for one name. So where a header is shown,
// ScreenTitle hands its text to that header and draws nothing itself. Where
// there is none (the tab screens, and the stack screens that hide it), it
// draws the title in the `title` type, as `Header` does, with the screen's
// `header` role.
//
// Every screen routes through here, so the rule holds without each screen
// knowing which kind it is.
import { useContext, useLayoutEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import { HeaderShownContext } from 'expo-router/react-navigation';

import { ThemedText } from '@/components/themed-text';
import { Typography } from '@/theme/tokens';

export interface ScreenTitleProps {
  children: ReactNode;
  testID?: string;
}

/** The header text for a title, or null when it is not plain text. */
export function headerTitleOf(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (
    Array.isArray(children) &&
    children.every((child) => typeof child === 'string' || typeof child === 'number')
  ) {
    return children.join('');
  }
  return null;
}

/** Puts the title in the navigation header. Draws nothing. */
function HeaderTitle({ title }: { title: string }) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);
  return null;
}

export function ScreenTitle({ children, testID }: ScreenTitleProps) {
  const headerShown = useContext(HeaderShownContext) === true;
  const headerTitle = headerShown ? headerTitleOf(children) : null;

  if (headerTitle !== null) return <HeaderTitle title={headerTitle} />;

  return (
    <ThemedText accessibilityRole="header" style={styles.title} testID={testID}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  title: Typography.title,
});
