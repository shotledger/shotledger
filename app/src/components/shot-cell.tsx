// Shot Cell (#822, DESIGN.md "Shot Cell"): one shot of a series, 48dp
// square at least, the way a shooter corrects a shot. The cell being
// entered is outlined (`selectedOutline` on a `selected` fill); an empty
// cell shows a dash in secondary text. A component only: the series-entry
// screen still draws ShotChips until the per-screen rollout.
import { Pressable, StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import type { EntryShot } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';

import { formatShotValue } from '@/components/shot-value';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing, TabularNums } from '@/theme/tokens';

export interface ShotCellProps {
  shot: EntryShot | null;
  /** 'integer' prints 9, 10 and X; 'decimal' prints 10.9 / (10.9). */
  mode: 'integer' | 'decimal';
  /** 0-based position in the series; the label says "Shot 1" for 0. */
  index: number;
  /** The cell the next key press goes into. */
  current?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** What a screen reader says for a cell: its position, then its value or that it is empty. */
export function shotCellLabel(
  t: TFunction,
  index: number,
  shot: EntryShot | null,
  mode: 'integer' | 'decimal',
): string {
  const number = index + 1;
  if (!shot) return t('components.shotCellEmpty', { number });
  if (shot.isInnerTen) {
    return t('components.shotCellInnerTen', {
      number,
      value: (shot.valueTenths / 10).toFixed(mode === 'decimal' ? 1 : 0),
    });
  }
  return t('components.shotCell', { number, value: formatShotValue(shot, mode) });
}

export function ShotCell({ shot, mode, index, current = false, onPress, testID }: ShotCellProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const style = [
    styles.cell,
    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
    current && { backgroundColor: theme.selected, borderColor: theme.selectedOutline },
  ];
  const text = (
    <ThemedText
      type="headline"
      themeColor={shot ? 'text' : 'textSecondary'}
      style={TabularNums}
      numberOfLines={1}
    >
      {formatShotValue(shot, mode)}
    </ThemedText>
  );
  const label = shotCellLabel(t, index, shot, mode);

  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={label} testID={testID}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        pressed && !current && { backgroundColor: theme.backgroundSelected },
      ]}
      testID={testID}
    >
      {text}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
