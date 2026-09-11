// Timers route. Setup (the fields) and running (countdown) are two views of
// one screen, switched on the engine's phase — `useTimer`
// (features/timer/use-timer.ts) drives the pure `TimerController`/
// `TimerEngine` (shared/src/timer).
//
// One route, three modes: the time-limit/interval timer below, the
// microphone-driven shot timer in features/timer/ipsc-timer.tsx, and the
// fälttimer. The mode segmented control is rendered by whichever mode is
// active, in its setup view only — switching mid-run would strand a recorder
// or an interval.
import {
  TIMER_CUE_MODES,
  type TimerConfig,
  type TimerCueMode,
  type TimerPhaseKind,
} from '@shotledger/shared';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { useKeepAwakeOnScreen } from '@/features/timer/use-keep-awake-on-screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { FaltTimer } from '@/features/timer/falt-timer';
import { IpscTimer } from '@/features/timer/ipsc-timer';
import { useTimerCueMode } from '@/features/timer/use-timer-settings';
import { useTimer } from '@/features/timer/use-timer';
import { Spacing, type ThemeColor } from '@/theme/tokens';

/** Copied to a plain array so the JSX map is not typed as `readonly`. */
const CUE_MODE_OPTIONS: TimerCueMode[] = [...TIMER_CUE_MODES];

const PHASE_COLOR: Record<TimerPhaseKind, ThemeColor> = {
  idle: 'textSecondary',
  readyDelay: 'primary',
  series: 'success',
  rest: 'textSecondary',
  done: 'primary',
};

function secondsInput(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildConfig(
  parSeconds: string,
  readyDelaySeconds: string,
  reps: string,
  restSeconds: string,
): TimerConfig {
  const par = Math.max(0.1, secondsInput(parSeconds) || 3);
  const ready = Math.max(0, secondsInput(readyDelaySeconds));
  const repCount = Math.max(1, Math.round(secondsInput(reps) || 1));
  const rest = Math.max(0, secondsInput(restSeconds));

  return {
    readyDelayMs: Math.round(ready * 1_000),
    series: Array.from({ length: repCount }, (_, index) => ({
      index,
      durationMs: Math.round(par * 1_000),
    })),
    restMs: Math.round(rest * 1_000),
  };
}

function formatSeconds(ms: number): string {
  return (ms / 1_000).toFixed(1);
}

type TimerMode = 'regular' | 'ipsc' | 'falt';

export default function TimersScreen() {
  const { t } = useTranslation();
  // All three modes live on this route, so one lock covers them — and it
  // holds between runs, not only during one.
  useKeepAwakeOnScreen('timer-screen');

  const [mode, setMode] = useState<TimerMode>('regular');

  const modeSelector = (
    <SegmentedControl<TimerMode>
      options={[
        { value: 'regular', label: t('timer.modes.regular') },
        { value: 'ipsc', label: t('timer.modes.ipsc') },
        { value: 'falt', label: t('timer.modes.falt') },
      ]}
      value={mode}
      onChange={setMode}
      testID="timer-mode"
    />
  );

  if (mode === 'ipsc') return <IpscTimer modeSelector={modeSelector} />;
  if (mode === 'falt') return <FaltTimer modeSelector={modeSelector} />;
  return <TimeLimitTimer modeSelector={modeSelector} />;
}

function TimeLimitTimer({ modeSelector }: { modeSelector: ReactNode }) {
  const { t } = useTranslation();

  const [parSeconds, setParSeconds] = useState('3');
  const [readyDelaySeconds, setReadyDelaySeconds] = useState('3');
  const [reps, setReps] = useState('1');
  const [restSeconds, setRestSeconds] = useState('0');
  const [cueMode, setCueMode] = useTimerCueMode();

  const config = useMemo<TimerConfig>(
    () => buildConfig(parSeconds, readyDelaySeconds, reps, restSeconds),
    [parSeconds, readyDelaySeconds, reps, restSeconds],
  );

  const { phase, start, reset } = useTimer(config, cueMode);
  const totalSeries = config.series.length;

  if (phase.kind === 'idle') {
    return (
      <Screen>
        {modeSelector}
        <Card style={styles.setupForm} testID="timer-setup-form">
          <ThemedText type="smallBold">{t('timer.fields.parSeconds')}</ThemedText>
          <TextField
            value={parSeconds}
            onChangeText={setParSeconds}
            keyboardType="decimal-pad"
            testID="timer-par"
          />
          <ThemedText type="smallBold">{t('timer.fields.readyDelaySeconds')}</ThemedText>
          <TextField
            value={readyDelaySeconds}
            onChangeText={setReadyDelaySeconds}
            keyboardType="decimal-pad"
            testID="timer-ready"
          />
          <ThemedText type="smallBold">{t('timer.fields.reps')}</ThemedText>
          <TextField
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
            testID="timer-reps"
          />
          <ThemedText type="smallBold">{t('timer.fields.restSeconds')}</ThemedText>
          <TextField
            value={restSeconds}
            onChangeText={setRestSeconds}
            keyboardType="decimal-pad"
            testID="timer-rest"
          />
        </Card>

        <Card style={styles.setupForm} testID="timer-cues">
          <ThemedText type="smallBold">{t('timer.cuesTitle')}</ThemedText>
          <SegmentedControl<TimerCueMode>
            options={CUE_MODE_OPTIONS.map((mode) => ({
              value: mode,
              label: t(`timer.cueMode.${mode}` as const),
            }))}
            value={cueMode}
            onChange={setCueMode}
            testID="timer-cue-mode"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('timer.cuesHint')}
          </ThemedText>
        </Card>

        <PrimaryButton label={t('timer.start')} onPress={start} testID="timer-start" />
      </Screen>
    );
  }

  const stateLabel =
    phase.kind === 'series' ? t('timer.state.series') : t(`timer.state.${phase.kind}` as const);
  const remainingSeconds = formatSeconds(phase.remainingMs);

  return (
    <Screen scroll={false} style={styles.runningScreen}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {phase.seriesIndex >= 0
          ? t('timer.seriesProgress', { current: phase.seriesIndex + 1, total: totalSeries })
          : ' '}
      </ThemedText>
      <View style={styles.countdownWrap}>
        <ThemedText
          type="title"
          themeColor={PHASE_COLOR[phase.kind]}
          style={styles.stateLabel}
          testID="timer-state-label"
        >
          {stateLabel}
        </ThemedText>
        <ThemedText
          type="title"
          themeColor={PHASE_COLOR[phase.kind]}
          style={styles.countdown}
          testID="timer-countdown"
        >
          {phase.kind === 'done' ? '—' : remainingSeconds}
        </ThemedText>
      </View>
      <PrimaryButton
        label={phase.kind === 'done' ? t('timer.reset') : t('timer.stop')}
        onPress={reset}
        testID="timer-reset"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  setupForm: {
    gap: Spacing.two,
  },
  runningScreen: {
    justifyContent: 'space-between',
    paddingVertical: Spacing.five,
  },
  countdownWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  stateLabel: {
    fontSize: 28,
    lineHeight: 34,
  },
  countdown: {
    fontSize: 96,
    lineHeight: 100,
    fontVariant: ['tabular-nums'],
  },
});
