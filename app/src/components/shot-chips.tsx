import { Pressable, StyleSheet, View } from 'react-native';
import type { EntryShot } from '@shotledger/shared';

import { formatShotValue } from '@/components/shot-value';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export { formatShotValue };

export interface ShotChipsProps {
  shots: readonly (EntryShot | null)[];
  /** 'integer' prints 9, 10 and X; 'decimal' prints 10.9 / (10.9). */
  mode: 'integer' | 'decimal';
  /** Chip currently being entered/edited; -1 or >= length for none. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  testIDPrefix?: string;
}

/** The per-shot chip row a series is entered into — fills left to right. */
export function ShotChips({
  shots,
  mode,
  selectedIndex = -1,
  onSelect,
  testIDPrefix = 'shot',
}: ShotChipsProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {shots.map((shot, index) => {
        const selected = index === selectedIndex;
        const content = (
          <View
            style={[
              styles.chip,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              selected && { borderColor: theme.selectedOutline, backgroundColor: theme.selected },
            ]}
          >
            <ThemedText type="smallBold" themeColor={shot ? 'text' : 'textSecondary'}>
              {formatShotValue(shot, mode)}
            </ThemedText>
          </View>
        );

        if (!onSelect) {
          return (
            <View key={index} testID={`${testIDPrefix}-${index + 1}`}>
              {content}
            </View>
          );
        }
        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`${testIDPrefix}-${index + 1}`}
            onPress={() => onSelect(index)}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minWidth: 46,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 2,
    alignItems: 'center',
  },
});
