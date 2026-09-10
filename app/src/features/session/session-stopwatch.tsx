// A plain count-up stopwatch for the series entry screen (backlog §6): start,
// stop, reset, MM:SS. Deliberately not part of `features/timer/` — those three
// (PAR drill, IPSC shot timer, fälttimer) count down and cue the shooter; this
// one only tells you how long you have been at it.
//
// The tick just re-renders; the time itself comes from `stopwatchElapsedMs`
// reading the clock, so a backgrounded screen picks up where the wall clock is
// rather than where the ticks stopped.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import {
  formatStopwatch,
  resetStopwatch,
  startStopwatch,
  stopStopwatch,
  stopwatchElapsedMs,
  STOPWATCH_ZERO,
  type StopwatchState,
} from '@/features/session/stopwatch';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/** Sub-second so the displayed second turns over promptly, not up to a second late. */
const TICK_MS = 250;

export function SessionStopwatch() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [state, setState] = useState<StopwatchState>(STOPWATCH_ZERO);
  const [now, setNow] = useState(() => Date.now());

  const isRunning = state.startedAt !== null;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isRunning]);

  function onToggle() {
    const at = Date.now();
    setNow(at);
    setState((current) =>
      (current.startedAt === null ? startStopwatch : stopStopwatch)(current, at),
    );
  }

  function onReset() {
    setNow(Date.now());
    setState(resetStopwatch());
  }

  return (
    <Card>
      <ThemedText type="smallBold">{t('session.stopwatch.title')}</ThemedText>
      <ThemedText style={styles.clock} testID="session-stopwatch-time">
        {formatStopwatch(stopwatchElapsedMs(state, now))}
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          testID="session-stopwatch-toggle"
          onPress={onToggle}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold" themeColor="onPrimary">
            {t(isRunning ? 'session.stopwatch.stop' : 'session.stopwatch.start')}
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="session-stopwatch-reset"
          onPress={onReset}
          style={({ pressed }) => [
            styles.button,
            { borderWidth: 1, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold">{t('session.stopwatch.reset')}</ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  clock: {
    fontSize: 48,
    lineHeight: 54,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
