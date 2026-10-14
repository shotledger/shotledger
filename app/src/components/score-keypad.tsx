// The score keypad (#822 direction A, "Entering a series"): the live totals,
// the shot cells, a row of small tools ending in Delete, then the keys — in
// that order top to bottom, so everything a thumb presses sits low on the
// screen. All entry behaviour lives in shared/scoring/entry.ts
// (docs/specs/m3-scoring-spec.md §3); this component renders the state and
// forwards key presses, so the state machine stays unit-testable.
import { useEffect, type ReactNode } from 'react';
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
  enteredShots,
  pressKey,
  selectShot,
  seriesTotalTenths,
  tenthsToScore,
  visibleKeys,
  type KeypadKey,
  type KeypadState,
} from '@shotledger/shared';

import { SeriesCelebration, type Celebration } from '@/components/series-celebration';
import { ShotCell } from '@/components/shot-cell';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing, TabularNums } from '@/theme/tokens';

/** Keys are 56dp: above the 48dp floor, for a gloved thumb (design review, Score Keypad). */
const KEY_HEIGHT = 56;

export interface ScoreKeypadProps {
  state: KeypadState;
  onChange: (next: KeypadState) => void;
  /** The tier just reached (#482); plays over the keypad. */
  celebration?: Celebration | null;
  /** Gold total while the series sits at gold or perfect. */
  highlightTotal?: boolean;
  /** More running figures beside the series total: the session's, last time's. */
  totals?: ReactNode;
  /** Small controls before Delete in the tool row: photo, sighter. */
  tools?: ReactNode;
}

/** Spoken label: 'X' alone reads as a letter, not as "inner ten". */
function accessibilityLabel(key: KeypadKey, t: (k: string) => string): string {
  if (key === 'X') return t('session.innerTenCount');
  return key;
}

/** A score as the keypad has always printed it: 37, 20.1; a whole decimal total reads 20. */
export function formatScore(tenths: number): string {
  return String(tenthsToScore(tenths));
}

/** The running series total with its inner tens, 0X included (maintainer's ruling). */
function SeriesTotal({
  state,
  highlight,
  celebrationId,
}: {
  state: KeypadState;
  highlight: boolean;
  celebrationId?: number;
}) {
  const { t } = useTranslation();
  const total = formatScore(seriesTotalTenths(state));
  const innerTens = t('entryA.innerTens', {
    count: enteredShots(state).filter((shot) => shot.isInnerTen).length,
  });

  const reduceMotion = useReducedMotion();
  const totalScale = useSharedValue(1);
  useEffect(() => {
    if (celebrationId === undefined || reduceMotion) return;
    totalScale.value = withSequence(
      withTiming(1.35, { duration: 160 }),
      withTiming(1, { duration: 260 }),
    );
  }, [celebrationId, reduceMotion, totalScale]);
  const totalStyle = useAnimatedStyle(() => ({ transform: [{ scale: totalScale.value }] }));

  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={`${t('entryA.series')} ${total}, ${innerTens}`}
    >
      <View style={styles.valueRow}>
        <Animated.View style={totalStyle}>
          <ThemedText
            type="score"
            themeColor={highlight ? 'celebration' : 'text'}
            testID="series-running-total"
          >
            {total}
          </ThemedText>
        </Animated.View>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={TabularNums}
          testID="series-inner-tens"
        >
          {innerTens}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('entryA.series')}
      </ThemedText>
    </View>
  );
}

export function ScoreKeypad({
  state,
  onChange,
  celebration = null,
  highlightTotal = false,
  totals,
  tools,
}: ScoreKeypadProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Delete lives in the tool row, so the grid is the twelve value keys:
  // 1–9, then 0, 10 and X along the bottom, as on a phone's dial pad.
  const keys = visibleKeys(state).filter((key) => key !== 'backspace');

  return (
    <View style={styles.container}>
      <View style={styles.totalsRow}>
        <SeriesTotal state={state} highlight={highlightTotal} celebrationId={celebration?.id} />
        {totals}
      </View>

      <View style={styles.cells}>
        {state.shots.map((shot, index) => (
          <ShotCell
            key={index}
            shot={shot}
            mode={state.mode}
            index={index}
            current={index === state.cursor}
            onPress={() => onChange(selectShot(state, index))}
            testID={`shot-${index + 1}`}
          />
        ))}
      </View>

      {state.mode === 'decimal' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.keypadHintDecimal')}
        </ThemedText>
      )}

      <View style={styles.tools}>
        {tools}
        <View style={styles.toolEnd}>
          <KeypadTool
            label={`⌫ ${t('session.backspace')}`}
            accessibilityLabel={t('session.backspace')}
            onPress={() => onChange(pressKey(state, 'backspace'))}
            testID="key-backspace"
          />
        </View>
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
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="headline" style={TabularNums}>
              {key}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {celebration && <SeriesCelebration key={celebration.id} celebration={celebration} />}
    </View>
  );
}

/** One small control in the keypad's tool row, at the 48dp floor. */
export function KeypadTool({
  label,
  onPress,
  selected,
  testID,
  accessibilityLabel: a11yLabel,
}: {
  label: string;
  onPress: () => void;
  /** Set for a toggle (Sighter): its state shows as fill plus outline, never colour alone. */
  selected?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const isToggle = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={isToggle ? { checked: selected } : undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tool,
        { borderColor: theme.border },
        selected === true && {
          backgroundColor: theme.selected,
          borderColor: theme.selectedOutline,
        },
        pressed && selected !== true && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <ThemedText type={selected === true ? 'smallBold' : 'small'}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
  },
  stat: {
    gap: Spacing.half,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  cells: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Delete sits at the far end, away from the photo and sighter tools.
  toolEnd: {
    marginLeft: 'auto',
  },
  tool: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
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
    minHeight: KEY_HEIGHT,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
