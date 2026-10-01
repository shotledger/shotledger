// The button a swiped list row reveals: an icon on its ground, with the word
// kept as the accessibility label (#456 — the maintainer wanted icons, not text).
import { Pressable, StyleSheet } from 'react-native';

import { TrashIcon } from '@/components/icons';
import { ShareIcon } from '@/components/share-icon';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export type SwipeActionKind = 'delete' | 'share';

export interface SwipeActionProps {
  kind: SwipeActionKind;
  /** What the button does, in words — read out by screen readers. */
  label: string;
  onPress: () => void;
  testID?: string;
}

export function SwipeAction({ kind, label, onPress, testID }: SwipeActionProps) {
  const theme = useTheme();
  const isDelete = kind === 'delete';
  const color = isDelete ? theme.onPrimary : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: isDelete ? theme.danger : theme.backgroundSelected },
        pressed && styles.pressed,
      ]}
    >
      {isDelete ? <TrashIcon color={color} /> : <ShareIcon color={color} size={24} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
  },
  pressed: {
    opacity: 0.85,
  },
});
