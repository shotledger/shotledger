// A "Details" fold for a form's optional fields (#822, finding "Long forms
// with every field at the same weight"): the required fields lead, the rest
// sit behind one 48dp row that says what it holds. The fields stay mounted
// while folded, so what was typed survives a close and nothing is lost.
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chevron } from '@/components/drill-down-row';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Spacing } from '@/theme/tokens';

export interface DetailsDisclosureProps {
  /** The row's label, e.g. "Details" (Title Case in English). */
  title: string;
  /** What is inside, in sentence case: "Name, location, tags". */
  summary?: string;
  defaultOpen?: boolean;
  testID?: string;
  children: ReactNode;
}

export function DetailsDisclosure({
  title,
  summary,
  defaultOpen = false,
  testID,
  children,
}: DetailsDisclosureProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
        onPress={() => setOpen((was) => !was)}
        testID={testID}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.text}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {summary ? (
            <ThemedText type="small" themeColor="textSecondary">
              {summary}
            </ThemedText>
          ) : null}
        </View>
        <Chevron expanded={open} color={theme.textSecondary} />
      </Pressable>
      {/* Hidden, not unmounted: a closed fold keeps its fields' state. */}
      <View style={[styles.body, !open && styles.hidden]} testID={testID && `${testID}-body`}>
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  text: { flexShrink: 1, gap: Spacing.half },
  body: { gap: Spacing.three },
  hidden: { display: 'none' },
  pressed: { opacity: 0.85 },
});
