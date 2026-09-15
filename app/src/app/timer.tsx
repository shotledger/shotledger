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
  DEFAULT_TIME_LIMIT_SETUP,
  MAX_READY_DELAY_SECONDS,
  MAX_REPETITIONS,
  MAX_REST_SECONDS,
  MAX_TIME_LIMIT_SECONDS,
  MIN_REPETITIONS,
  MIN_TIME_LIMIT_SECONDS,
  TIMER_CUE_MODES,
  TIME_LIMIT_STEP_SECONDS,
  buildTimeLimitConfig,
  type TimeLimitSetup,
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
import { Slider } from '@/components/slider';
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

/** Label, current value and the slider that sets it — the fälttimer's layout. */
function SliderField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  /** The value as the user reads it, unit included. */
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold" style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold" testID={`${testID}-value`}>
          {display}
        </ThemedText>
      </View>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        accessibilityLabel={label}
        testID={`${testID}-slider`}
      />
    </View>
  );
}

function TimeLimitTimer({ modeSelector }: { modeSelector: ReactNode }) {
  const { t } = useTranslation();

  const [setup, setSetup] = useState<TimeLimitSetup>(DEFAULT_TIME_LIMIT_SETUP);
  const [cueMode, setCueMode] = useTimerCueMode();

  const config = useMemo(() => buildTimeLimitConfig(setup), [setup]);

  const { phase, start, reset } = useTimer(config, cueMode);
  const totalSeries = config.series.length;

  if (phase.kind === 'idle') {
    return (
      <Screen>
        {modeSelector}
        <Card style={styles.setupForm} testID="timer-setup-form">
          {/* Sliders, not text fields: the maintainer could not tell what
              "Time Limit (s)" wanted typed into it (#138). The unit lives in
              the value on the right, so the labels drop the "(s)". */}
          <SliderField
            label={t('timer.fields.timeLimit')}
            value={setup.timeLimitSeconds}
            display={t('timer.seconds', { value: setup.timeLimitSeconds })}
            min={MIN_TIME_LIMIT_SECONDS}
            max={MAX_TIME_LIMIT_SECONDS}
            step={TIME_LIMIT_STEP_SECONDS}
            onChange={(timeLimitSeconds) => setSetup({ ...setup, timeLimitSeconds })}
            testID="timer-par"
          />
          <SliderField
            label={t('timer.fields.readyDelay')}
            value={setup.readyDelaySeconds}
            display={t('timer.seconds', { value: setup.readyDelaySeconds })}
            min={0}
            max={MAX_READY_DELAY_SECONDS}
            step={TIME_LIMIT_STEP_SECONDS}
            onChange={(readyDelaySeconds) => setSetup({ ...setup, readyDelaySeconds })}
            testID="timer-ready"
          />
          <SliderField
            label={t('timer.fields.reps')}
            value={setup.repetitions}
            display={String(setup.repetitions)}
            min={MIN_REPETITIONS}
            max={MAX_REPETITIONS}
            onChange={(repetitions) => setSetup({ ...setup, repetitions })}
            testID="timer-reps"
          />
          {/* Rest only exists between repetitions, so it is meaningless for a
              single one — hidden rather than shown doing nothing. */}
          {setup.repetitions > 1 && (
            <SliderField
              label={t('timer.fields.rest')}
              value={setup.restSeconds}
              display={t('timer.seconds', { value: setup.restSeconds })}
              min={0}
              max={MAX_REST_SECONDS}
              onChange={(restSeconds) => setSetup({ ...setup, restSeconds })}
              testID="timer-rest"
            />
          )}
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
  field: {
    gap: Spacing.half,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
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
