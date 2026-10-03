// The full-score moment on the keypad (#482): gold rings ripple out like a
// target and the label pops in, then everything fades. Touches pass through,
// so it never blocks entry or Save.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import type { CelebrationTier } from '@/features/session/celebration';
import { useTheme } from '@/hooks/use-theme';
import { notifySuccess, tick, vibrate } from '@/platform/haptics';
import { Radius, Spacing } from '@/theme/tokens';

export interface Celebration {
  tier: CelebrationTier;
  /** Changes on every trigger, so the same tier can play again (gallery). */
  id: number;
}

const RING_SIZE = 120;
const RING_STAGGER_MS = 140;
const RING_MS = 900;
const LABEL_HOLD_MS = 900;
const TOTAL_MS = 1700;

function playHaptic(tier: CelebrationTier): () => void {
  if (tier === 'gold') {
    tick();
    return () => {};
  }
  notifySuccess();
  if (tier !== 'perfect') return () => {};
  // A second, heavier beat sets the rarest tier apart by feel alone.
  const timer = setTimeout(() => vibrate(250), 220);
  return () => clearTimeout(timer);
}

function Ring({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      index * RING_STAGGER_MS,
      withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : 1 - progress.value,
    transform: [{ scale: 0.2 + progress.value * 2.4 }],
  }));
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

function Label({ tier, reduceMotion }: { tier: 'fullScore' | 'perfect'; reduceMotion: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);
  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 180 }),
      withDelay(LABEL_HOLD_MS, withTiming(0, { duration: 400 })),
    );
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(1.12, { duration: 220, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 160 }),
      );
    }
  }, [opacity, scale, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        styles.label,
        { backgroundColor: theme.background, borderColor: theme.celebration },
        style,
      ]}
    >
      <ThemedText type="subtitle" themeColor="celebration" style={styles.title}>
        {t(tier === 'perfect' ? 'session.celebrationPerfect' : 'session.celebrationFullScore')}
      </ThemedText>
    </Animated.View>
  );
}

/** Mount with `key={celebration.id}` so each trigger starts fresh. */
export function SeriesCelebration({ celebration }: { celebration: Celebration }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const { tier } = celebration;

  useEffect(() => playHaptic(tier), [tier]);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), TOTAL_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || tier === 'gold') return null;

  const rings = tier === 'perfect' ? 5 : 3;
  return (
    <View
      pointerEvents="none"
      style={styles.overlay}
      testID="series-celebration"
      accessibilityLiveRegion="polite"
    >
      {!reduceMotion &&
        Array.from({ length: rings }, (_, index) => (
          <Ring key={index} index={index} color={theme.celebration} />
        ))}
      <Label tier={tier} reduceMotion={reduceMotion} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 6,
  },
  label: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 2,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
});
