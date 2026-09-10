// A plain count-up stopwatch for a session: start, stop, reset, MM:SS.
// Deliberately not part of `features/timer/` — those three (time limit,
// shot timer, fälttimer) count down and cue the shooter; this one only tells
// you how long you have been at it.
//
// The clock belongs to the session, not to the screen (`stopwatch-store.ts`),
// so the session view and series entry show the same running count and
// navigating between them does not reset it (#138).
//
// The tick just re-renders; the time itself comes from `stopwatchElapsedMs`
// reading the clock, so a backgrounded screen picks up where the wall clock is
// rather than where the ticks stopped.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { formatStopwatch, stopwatchElapsedMs } from '@/features/session/stopwatch';
import {
  getSessionStopwatch,
  resetSessionStopwatch,
  startSessionStopwatch,
  stopSessionStopwatch,
  subscribeSessionStopwatch,
} from '@/features/session/stopwatch-store';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/** Sub-second so the displayed second turns over promptly, not up to a second late. */
const TICK_MS = 250;

export interface SessionStopwatchProps {
  /** The session being timed — its clock is shared by every screen showing it. */
  sessionId: string;
  /** `compact` drops the heading and shrinks the clock, for a busy screen. */
  variant?: 'full' | 'compact';
}

export function SessionStopwatch({ sessionId, variant = 'full' }: SessionStopwatchProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = useSyncExternalStore(
    useCallback((listener) => subscribeSessionStopwatch(sessionId, listener), [sessionId]),
    useCallback(() => getSessionStopwatch(sessionId), [sessionId]),
  );
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
    if (isRunning) stopSessionStopwatch(sessionId, at);
    else startSessionStopwatch(sessionId, at);
  }

  function onReset() {
    setNow(Date.now());
    resetSessionStopwatch(sessionId);
  }

  return (
    <Card>
      {variant === 'full' && (
        <ThemedText type="smallBold">{t('session.stopwatch.title')}</ThemedText>
      )}
      <ThemedText
        style={variant === 'compact' ? styles.clockCompact : styles.clock}
        testID="session-stopwatch-time"
      >
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
  clockCompact: {
    fontSize: 32,
    lineHeight: 38,
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
