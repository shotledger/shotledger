import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';

/** Laid-out height of the button: label line-height plus its vertical padding. */
const FabHeight = 20 + Spacing.three * 2;

/**
 * Vertical space a scrolling screen must reserve so its last row clears a FAB
 * of the given height: the gap below the button, the button, and a gap above
 * it. `Screen`'s `fab` prop applies it; nothing else should need it.
 */
export function fabClearanceFor(height: number): number {
  return Spacing.three + height + Spacing.four;
}

/**
 * The clearance before the button has been measured. The real height grows
 * with the system font size, which this estimate cannot see, so `Screen`
 * swaps in the measured one after the first layout.
 */
export const FabClearance = fabClearanceFor(FabHeight);

export interface FABProps extends Omit<PressableProps, 'style'> {
  label: string;
}

/**
 * Floating action button, bottom-right above the tab bar — one per screen.
 * Pass it to `Screen`'s `fab` prop; rendering it as a child puts it back
 * inside the scroll content, which is what issue #62 was.
 */
export function FAB({ label, ...rest }: FABProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.primary },
        pressed && styles.pressed,
      ]}
      {...rest}
    >
      <ThemedText type="smallBold" themeColor="onPrimary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.three,
    // A tab screen already ends at the tab bar; adding the tab inset again
    // floated the button over the middle of the list (#745).
    bottom: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
