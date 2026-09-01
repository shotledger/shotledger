import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  pressKey,
  selectShot,
  seriesTotalTenths,
  tenthsToScore,
  visibleKeys,
  type KeypadKey,
  type KeypadState,
} from '@shotledger/shared';

import { ShotChips } from '@/components/shot-chips';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface ScoreKeypadProps {
  state: KeypadState;
  onChange: (next: KeypadState) => void;
}

function keyLabel(key: KeypadKey): string {
  return key === 'backspace' ? '⌫' : key;
}

/** Spoken label: 'X' alone reads as a letter, not as "inner ten". */
function accessibilityLabel(key: KeypadKey, t: (k: string) => string): string {
  if (key === 'backspace') return t('session.backspace');
  if (key === 'X') return t('session.innerTenCount');
  return key;
}

/**
 * The score keypad. All behaviour lives in `shared/scoring/entry.ts`
 * (docs/specs/m3-scoring-spec.md §3); this component only renders the state
 * and forwards key presses, so the state machine stays unit-testable.
 */
export function ScoreKeypad({ state, onChange }: ScoreKeypadProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const keys = visibleKeys(state);
  const total = tenthsToScore(seriesTotalTenths(state));

  return (
    <View style={styles.container}>
      <ShotChips
        shots={state.shots}
        mode={state.mode}
        selectedIndex={state.cursor}
        onSelect={(index) => onChange(selectShot(state, index))}
      />

      <View style={styles.totalRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {state.mode === 'decimal' ? t('session.keypadHintDecimal') : t('session.keypadHint')}
        </ThemedText>
        <ThemedText type="smallBold" testID="series-running-total">
          {`${t('session.seriesTotal')}: ${total}`}
        </ThemedText>
      </View>

      <View style={styles.keys}>
        {keys.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel(key, t)}
            testID={`key-${key}`}
            onPress={() => onChange(pressKey(state, key))}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              key === 'backspace' && { backgroundColor: theme.backgroundSelected },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="subtitle" style={styles.keyLabel}>
              {keyLabel(key)}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  key: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 88,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
  },
  keyLabel: {
    fontSize: 24,
    lineHeight: 30,
  },
  pressed: {
    opacity: 0.7,
  },
});
