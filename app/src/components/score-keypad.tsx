import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  pressKey,
  selectShot,
  seriesTotalTenths,
  tenthsToScore,
  visibleKeys,
  type KeypadKey,
  type KeypadState,
} from '@shotledger/shared';

import { SeriesCelebration, type Celebration } from '@/components/series-celebration';
import { ShotChips } from '@/components/shot-chips';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface ScoreKeypadProps {
  state: KeypadState;
  onChange: (next: KeypadState) => void;
  /** The tier just reached (#482); plays over the keypad. */
  celebration?: Celebration | null;
  /** Gold total while the series sits at gold or perfect. */
  highlightTotal?: boolean;
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
 * The score keypad. All behavior lives in `shared/scoring/entry.ts`
 * (docs/specs/m3-scoring-spec.md §3); this component only renders the state
 * and forwards key presses, so the state machine stays unit-testable.
 */
export function ScoreKeypad({
  state,
  onChange,
  celebration = null,
  highlightTotal = false,
}: ScoreKeypadProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const keys = visibleKeys(state);
  const total = tenthsToScore(seriesTotalTenths(state));

  const reduceMotion = useReducedMotion();
  const totalScale = useSharedValue(1);
  const celebrationId = celebration?.id;
  useEffect(() => {
    if (celebrationId === undefined || reduceMotion) return;
    totalScale.value = withSequence(
      withTiming(1.35, { duration: 160 }),
      withTiming(1, { duration: 260 }),
    );
  }, [celebrationId, reduceMotion, totalScale]);
  const totalStyle = useAnimatedStyle(() => ({ transform: [{ scale: totalScale.value }] }));

  return (
    <View style={styles.container}>
      <ShotChips
        shots={state.shots}
        mode={state.mode}
        selectedIndex={state.cursor}
        onSelect={(index) => onChange(selectShot(state, index))}
      />

      <View style={styles.totalRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {state.mode === 'decimal' ? t('session.keypadHintDecimal') : t('session.keypadHint')}
        </ThemedText>
        <Animated.View style={totalStyle}>
          <ThemedText
            type="smallBold"
            themeColor={highlightTotal ? 'celebration' : 'text'}
            testID="series-running-total"
          >
            {`${t('session.seriesTotal')}: ${total}`}
          </ThemedText>
        </Animated.View>
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

      {celebration && <SeriesCelebration key={celebration.id} celebration={celebration} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  totalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  // Without this the hint is clipped by the running total on a narrow screen.
  hint: {
    flexShrink: 1,
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
