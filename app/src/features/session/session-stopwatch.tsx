// A plain count-up stopwatch for a session, MM:SS, with laps. The buttons
// follow a phone stopwatch: Lap·Start, Lap·Stop, Reset·Resume.
// Deliberately not part of `features/timer/` — those three (time limit,
// shot timer, fälttimer) count down and cue the shooter; this one only tells
// you how long you have been at it.
//
// It lives on the session view, not inside series entry where #135 first put
// it (maintainer, 2026-09-11: "probably better to have in the session"). The
// clock is still keyed by session rather than by screen (`stopwatch-store.ts`),
// so it keeps running while you move around inside that session — which is
// what makes putting it back on another screen a one-line change.
//
// The tick just re-renders; the time itself comes from `stopwatchElapsedMs`
// reading the clock, so a backgrounded screen picks up where the wall clock is
// rather than where the ticks stopped.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useKeepAwakeWhile } from '@/features/timer/use-keep-awake-on-screen';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import {
  formatStopwatch,
  stopwatchElapsedMs,
  stopwatchLaps,
  stopwatchPhase,
} from '@/features/session/stopwatch';
import {
  getSessionStopwatch,
  lapSessionStopwatch,
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
  /** The session being timed. The clock is keyed by it, not by the screen. */
  sessionId: string;
}

export function SessionStopwatch({ sessionId }: SessionStopwatchProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = useSyncExternalStore(
    useCallback((listener) => subscribeSessionStopwatch(sessionId, listener), [sessionId]),
    useCallback(() => getSessionStopwatch(sessionId), [sessionId]),
  );
  const [now, setNow] = useState(() => Date.now());

  const phase = stopwatchPhase(state);
  const isRunning = phase === 'running';
  // A running stopwatch is a timer like any other: the screen has to stay
  // readable while it counts (maintainer, 2026-09-11, "and timer in session
  // view"). Tied to running rather than to the screen — the session view is
  // somewhere you sit and read, and holding the phone awake for all of that
  // would be a battery cost for nothing.
  useKeepAwakeWhile(isRunning, 'session-stopwatch');

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

  // Lap while running, Reset once stopped — the same slot, as on a phone.
  function onSecondary() {
    const at = Date.now();
    setNow(at);
    if (phase === 'stopped') resetSessionStopwatch(sessionId);
    else lapSessionStopwatch(sessionId, at);
  }

  const primaryLabel =
    phase === 'running'
      ? 'session.stopwatch.stop'
      : phase === 'stopped'
        ? 'session.stopwatch.resume'
        : 'session.stopwatch.start';
  const secondaryDisabled = phase === 'idle';
  const laps = stopwatchLaps(state);

  return (
    <Card>
      <ThemedText type="smallBold">{t('session.stopwatch.title')}</ThemedText>
      <ThemedText style={styles.clock} testID="session-stopwatch-time">
        {formatStopwatch(stopwatchElapsedMs(state, now))}
      </ThemedText>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: secondaryDisabled }}
          disabled={secondaryDisabled}
          testID="session-stopwatch-secondary"
          onPress={onSecondary}
          style={({ pressed }) => [
            styles.button,
            { borderWidth: 1, borderColor: theme.border },
            secondaryDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold">
            {t(phase === 'stopped' ? 'session.stopwatch.reset' : 'session.stopwatch.lap')}
          </ThemedText>
        </Pressable>
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
            {t(primaryLabel)}
          </ThemedText>
        </Pressable>
      </View>
      {laps.map((lap) => (
        <View
          key={lap.number}
          style={[styles.lapRow, { borderTopColor: theme.border }]}
          testID={`session-stopwatch-lap-${lap.number}`}
        >
          <ThemedText>{t('session.stopwatch.lapNumber', { number: lap.number })}</ThemedText>
          <ThemedText style={styles.lapTime}>{formatStopwatch(lap.ms)}</ThemedText>
        </View>
      ))}
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
  disabled: {
    opacity: 0.4,
  },
  lapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lapTime: {
    fontVariant: ['tabular-nums'],
  },
});
