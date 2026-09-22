// Timers route. Setup (the fields) and running (the clock) are two views of
// one screen, switched on the engine's phase — `useTimer`
// (features/timer/use-timer.ts) drives the pure `TimerController`/
// `TimerEngine` (shared/src/timer).
//
// One route, two modes: the timer below and the fälttimer. They used to be
// three, with an IPSC-style shot timer beside this one; #346 merged them,
// because a random start delay, an open-ended string and a microphone are
// options on this drill rather than a second machine. The fälttimer stays
// distinct — it is a fixed SPSF command sequence, not a drill anyone sets up.
//
// The mode selector is rendered by whichever mode is active, in its setup
// view only — switching mid-run would strand a recorder or an interval.
import {
  MAX_AUTO_STOP_SECONDS,
  MAX_RANDOM_DELAY_SECONDS,
  MAX_READY_DELAY_SECONDS,
  MAX_REPETITIONS,
  MAX_REST_SECONDS,
  MAX_TIME_LIMIT_SECONDS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_REPETITIONS,
  MIN_TIME_LIMIT_SECONDS,
  MIN_TRIGGER_EXCESS_DB,
  SENSITIVITY_PRESETS,
  TIMER_CUE_MODES,
  TIME_LIMIT_STEP_SECONDS,
  TRIGGER_EXCESS_STEP_DB,
  type DetectedShot,
  type ShotSensitivity,
  type TimerCueMode,
  type TimerPhaseKind,
  type TimerSetup,
} from '@shotledger/shared';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { InfoButton } from '@/components/info-button';
import { PrimaryButton } from '@/components/primary-button';
import { RangeSlider } from '@/components/range-slider';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { FaltTimer } from '@/features/timer/falt-timer';
import { LevelMeterBar } from '@/features/timer/level-meter-bar';
import { TimerMenu } from '@/features/timer/timer-menu';
import { useKeepAwakeOnScreen } from '@/features/timer/use-keep-awake-on-screen';
import { useLevelMeter } from '@/features/timer/use-level-meter';
import { useTimerSetup } from '@/features/timer/use-timer-settings';
import { useTimer } from '@/features/timer/use-timer';
import type { SeriesResult } from '@/features/timer/timer-controller';
import { Spacing, type ThemeColor } from '@/theme/tokens';

/** Copied to plain arrays so the JSX maps are not typed as `readonly`. */
const CUE_MODE_OPTIONS: TimerCueMode[] = [...TIMER_CUE_MODES];
const SENSITIVITIES: readonly ShotSensitivity[] = ['low', 'medium', 'high'];

const PHASE_COLOR: Record<TimerPhaseKind, ThemeColor> = {
  idle: 'textSecondary',
  readyDelay: 'primary',
  series: 'success',
  rest: 'textSecondary',
  done: 'primary',
};

function formatSeconds(ms: number | undefined): string {
  return ms === undefined ? '—' : (ms / 1_000).toFixed(1);
}

function formatSplit(ms: number | undefined): string {
  return ms === undefined ? '—' : (ms / 1_000).toFixed(2);
}

type TimerMode = 'timer' | 'falt';

export default function TimersScreen() {
  const { t } = useTranslation();
  // Both modes live on this route, so one lock covers them — and it holds
  // between runs, not only during one.
  useKeepAwakeOnScreen('timer-screen');

  const [mode, setMode] = useState<TimerMode>('timer');

  const modeSelector = (
    <SegmentedControl<TimerMode>
      options={[
        { value: 'timer', label: t('timer.modes.timer') },
        { value: 'falt', label: t('timer.modes.falt') },
      ]}
      value={mode}
      onChange={setMode}
      testID="timer-mode"
    />
  );

  if (mode === 'falt') return <FaltTimer modeSelector={modeSelector} />;
  return <Timer modeSelector={modeSelector} />;
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

function ShotList({
  shots,
  live,
  testID,
}: {
  shots: readonly DetectedShot[];
  /** Mid-series: nothing heard *yet*, rather than nothing heard at all. */
  live?: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  if (shots.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary" testID={`${testID}-empty`}>
        {t(live ? 'timer.shots.noShotsYet' : 'timer.shots.noShots')}
      </ThemedText>
    );
  }
  return (
    <View style={styles.shotList} testID={testID}>
      {shots.map((shot) => (
        <View key={shot.index} style={styles.shotRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('timer.shots.shotNumber', { number: shot.index + 1 })}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.numeric}>
            {t('timer.shots.shotAt', { time: formatSplit(shot.atMs) })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.numeric}>
            {t('timer.shots.split', { time: formatSplit(shot.splitMs) })}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function SeriesResultCard({ result, showTitle }: { result: SeriesResult; showTitle: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      {showTitle && (
        <ThemedText type="smallBold" testID={`timer-result-${result.seriesIndex}`}>
          {t('timer.shots.seriesTitle', { number: result.seriesIndex + 1 })}
        </ThemedText>
      )}
      <View style={styles.row}>
        <StatTile
          label={t('timer.shots.firstShot')}
          value={formatSplit(result.summary.firstShotMs)}
          testID={`timer-first-shot-${result.seriesIndex}`}
        />
        <StatTile
          label={t('timer.shots.total')}
          value={formatSplit(result.summary.totalMs)}
          testID={`timer-total-${result.seriesIndex}`}
        />
        <StatTile
          label={t('timer.shots.shotCount')}
          value={String(result.summary.shotCount)}
          testID={`timer-count-${result.seriesIndex}`}
        />
      </View>
      <ShotList shots={result.shots} testID={`timer-shot-list-${result.seriesIndex}`} />
    </Card>
  );
}

function Timer({ modeSelector }: { modeSelector: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [setup, setSetup] = useTimerSetup();
  // Collapsed by default: the detection options are tuned once and then left
  // alone, so they should not push the drill's own settings down the screen
  // on every visit.
  const [detectionOpen, setDetectionOpen] = useState(false);

  const update = (patch: Partial<TimerSetup>) => setSetup({ ...setup, ...patch });

  // Spoken in the app's current language — an ordinary UI prompt, not the
  // fälttimer's SPSF-regulated Swedish commands.
  const prompts = useMemo(
    () => ({
      language: i18n.language.startsWith('sv') ? 'sv-SE' : 'en-US',
      ready: t('timer.state.readyDelay'),
    }),
    [i18n.language, t],
  );

  const { phase, shots, results, error, micAvailable, start, stopSeries, reset } = useTimer(
    setup,
    prompts,
  );
  const totalSeries = setup.repetitions;

  // The setup meter runs the same detector the drill will, so what the
  // shooter tunes against is what the timer does. Paused while anything but
  // the setup view is on screen — both use the same microphone.
  const gate = useMemo(
    () => ({ triggerExcessDb: setup.triggerExcessDb, maxEventMs: setup.maxEventMs }),
    [setup.triggerExcessDb, setup.maxEventMs],
  );
  const meterOn = phase.kind === 'idle' && setup.recordShots && detectionOpen;
  const { currentDb, peakDb, noiseFloorDb, detectedCount } = useLevelMeter(meterOn, gate);

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
            display={
              setup.timeLimitSeconds === 0
                ? t('timer.fields.noLimit')
                : t('timer.seconds', { value: setup.timeLimitSeconds })
            }
            min={MIN_TIME_LIMIT_SECONDS}
            max={MAX_TIME_LIMIT_SECONDS}
            step={TIME_LIMIT_STEP_SECONDS}
            onChange={(timeLimitSeconds) => update({ timeLimitSeconds })}
            testID="timer-par"
          />
          {setup.timeLimitSeconds === 0 && (
            <ThemedText type="small" themeColor="textSecondary" testID="timer-no-limit-hint">
              {t('timer.fields.timeLimitHint')}
            </ThemedText>
          )}

          <View style={styles.switchRow}>
            <ThemedText type="smallBold" style={styles.label}>
              {t('timer.fields.randomStart')}
            </ThemedText>
            <Switch
              value={setup.randomStart}
              onValueChange={(randomStart) => update({ randomStart })}
              testID="timer-random-start"
            />
          </View>
          {setup.randomStart ? (
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold" style={styles.label}>
                  {t('timer.fields.startDelay')}
                </ThemedText>
                <ThemedText type="smallBold" testID="timer-delay-value">
                  {t('timer.fields.delayRange', {
                    from: setup.delayMinSeconds,
                    to: setup.delayMaxSeconds,
                  })}
                </ThemedText>
              </View>
              {/* One track, two thumbs: the delay is a range, and two stacked
                  sliders read as two unrelated settings. */}
              <RangeSlider
                low={setup.delayMinSeconds}
                high={setup.delayMaxSeconds}
                min={0}
                max={MAX_RANDOM_DELAY_SECONDS}
                onChange={({ low, high }) =>
                  update({ delayMinSeconds: low, delayMaxSeconds: high })
                }
                lowAccessibilityLabel={t('timer.fields.delayMin')}
                highAccessibilityLabel={t('timer.fields.delayMax')}
                testID="timer-delay"
              />
            </View>
          ) : (
            <SliderField
              label={t('timer.fields.readyDelay')}
              value={setup.readyDelaySeconds}
              display={t('timer.seconds', { value: setup.readyDelaySeconds })}
              min={0}
              max={MAX_READY_DELAY_SECONDS}
              step={TIME_LIMIT_STEP_SECONDS}
              onChange={(readyDelaySeconds) => update({ readyDelaySeconds })}
              testID="timer-ready"
            />
          )}

          <SliderField
            label={t('timer.fields.reps')}
            value={setup.repetitions}
            display={String(setup.repetitions)}
            min={MIN_REPETITIONS}
            max={MAX_REPETITIONS}
            onChange={(repetitions) => update({ repetitions })}
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
              onChange={(restSeconds) => update({ restSeconds })}
              testID="timer-rest"
            />
          )}
        </Card>

        <Card style={styles.setupForm} testID="timer-shots">
          <View style={styles.switchRow}>
            <ThemedText type="smallBold" style={styles.label}>
              {t('timer.shots.record')}
            </ThemedText>
            <TimerMenu />
            <Switch
              value={setup.recordShots}
              onValueChange={(recordShots) => update({ recordShots })}
              testID="timer-record-shots"
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('timer.shots.recordHint')}
          </ThemedText>

          {setup.recordShots && (
            <>
              {/* Silence can only end a series that has no clock of its own. */}
              {setup.timeLimitSeconds === 0 && (
                <SliderField
                  label={t('timer.fields.autoStop')}
                  value={setup.autoStopSeconds}
                  display={
                    setup.autoStopSeconds === 0
                      ? t('timer.fields.autoStopOff')
                      : t('timer.seconds', { value: setup.autoStopSeconds })
                  }
                  min={0}
                  max={MAX_AUTO_STOP_SECONDS}
                  onChange={(autoStopSeconds) => update({ autoStopSeconds })}
                  testID="timer-auto-stop"
                />
              )}

              <DrillDownRow
                title={t('timer.shots.detection')}
                value={t('timer.shots.triggerExcessDb', { value: setup.triggerExcessDb })}
                expanded={detectionOpen}
                onPress={() => setDetectionOpen((open) => !open)}
                testID="timer-detection-row"
              />
              {detectionOpen && (
                <>
                  <View style={styles.labelRow}>
                    <ThemedText type="smallBold" style={styles.label}>
                      {t('timer.shots.triggerLevel')}
                    </ThemedText>
                    <InfoButton
                      title={t('timer.shots.triggerLevel')}
                      body={t('timer.shots.sensitivityHint')}
                      testID="timer-sensitivity-info"
                    />
                  </View>
                  {/* The slider runs in sensitivity, not in the stored number:
                      a larger excess demands a louder sound over the room and
                      is the LEAST sensitive end. Negating keeps "right is more
                      sensitive", which is how the maintainer asked for it. */}
                  <Slider
                    value={-setup.triggerExcessDb}
                    min={-MAX_TRIGGER_EXCESS_DB}
                    max={-MIN_TRIGGER_EXCESS_DB}
                    step={TRIGGER_EXCESS_STEP_DB}
                    onChange={(sensitivity) => update({ triggerExcessDb: -sensitivity })}
                    accessibilityLabel={t('timer.shots.triggerLevel')}
                    testID="timer-level-slider"
                  />
                  <View style={styles.labelRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('timer.shots.sensitivityLow')}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('timer.shots.sensitivityHigh')}
                    </ThemedText>
                  </View>

                  <View style={styles.row} testID="timer-presets">
                    {SENSITIVITIES.map((preset) => (
                      <Pressable
                        key={preset}
                        onPress={() => update(SENSITIVITY_PRESETS[preset])}
                        testID={`timer-preset-${preset}`}
                      >
                        <Chip
                          label={t(`timer.shots.sensitivities.${preset}` as const)}
                          tone={
                            setup.triggerExcessDb === SENSITIVITY_PRESETS[preset].triggerExcessDb &&
                            setup.maxEventMs === SENSITIVITY_PRESETS[preset].maxEventMs
                              ? 'primary'
                              : 'neutral'
                          }
                        />
                      </Pressable>
                    ))}
                  </View>

                  {micAvailable && (
                    <>
                      <ThemedText type="smallBold">{t('timer.shots.liveMeter')}</ThemedText>
                      <LevelMeterBar
                        currentDb={currentDb}
                        peakDb={peakDb}
                        noiseFloorDb={noiseFloorDb}
                        thresholdDb={
                          noiseFloorDb === null ? null : noiseFloorDb + setup.triggerExcessDb
                        }
                        testID="timer-level-meter"
                      />
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        testID="timer-level-meter-hint"
                      >
                        {currentDb === null
                          ? t('timer.shots.liveMeterNeedsPermission')
                          : t('timer.shots.liveMeterHint')}
                      </ThemedText>
                      {/* The count is the only honest answer to "will it hear
                          my shot?": the meter shows a level, this shows what
                          the gate did with it. */}
                      {currentDb !== null && (
                        <ThemedText type="smallBold" testID="timer-detected-shots">
                          {t('timer.shots.detectedShots', { value: detectedCount })}
                        </ThemedText>
                      )}
                    </>
                  )}
                </>
              )}

              <ThemedText type="small" themeColor="textSecondary" testID="timer-privacy-note">
                {t('timer.shots.privacyNote')}
              </ThemedText>
              {!micAvailable && (
                <ThemedText type="small" themeColor="danger" testID="timer-unavailable">
                  {t('timer.shots.webUnavailable')}
                </ThemedText>
              )}
            </>
          )}
        </Card>

        <Card style={styles.setupForm} testID="timer-cues">
          <ThemedText type="smallBold">{t('timer.cuesTitle')}</ThemedText>
          <SegmentedControl<TimerCueMode>
            options={CUE_MODE_OPTIONS.map((cueMode) => ({
              value: cueMode,
              label: t(`timer.cueMode.${cueMode}` as const),
            }))}
            value={setup.cueMode}
            onChange={(cueMode) => update({ cueMode })}
            testID="timer-cue-mode"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('timer.cuesHint')}
          </ThemedText>
          {/* Spoken prompts are a kind of sound, so the switch has nothing to
              do while the cues are vibration only — hidden rather than shown
              doing nothing. */}
          {setup.cueMode !== 'vibrate' && (
            <View style={styles.switchRow}>
              <ThemedText type="small" style={styles.label}>
                {t('timer.spokenPrompts')}
              </ThemedText>
              <Switch
                value={setup.spokenPrompts}
                onValueChange={(spokenPrompts) => update({ spokenPrompts })}
                testID="timer-spoken-prompts"
              />
            </View>
          )}
        </Card>

        {error !== null && (
          <ThemedText type="small" themeColor="danger" testID="timer-error">
            {t(`timer.shots.errors.${error}` as const)}
          </ThemedText>
        )}

        <PrimaryButton label={t('timer.start')} onPress={start} testID="timer-start" />
      </Screen>
    );
  }

  if (phase.kind === 'done') {
    return (
      <Screen>
        {setup.recordShots && (
          <>
            <ThemedText type="smallBold">{t('timer.shots.resultTitle')}</ThemedText>
            {results.map((result) => (
              <SeriesResultCard
                key={result.seriesIndex}
                result={result}
                showTitle={totalSeries > 1}
              />
            ))}
          </>
        )}
        <PrimaryButton
          label={setup.recordShots ? t('timer.newRun') : t('timer.reset')}
          onPress={reset}
          testID="timer-reset"
        />
      </Screen>
    );
  }

  const stateLabel =
    phase.kind === 'series' ? t('timer.state.series') : t(`timer.state.${phase.kind}` as const);
  // An open-ended series has no remainder to show, so it counts up instead.
  const clock = phase.openEnded ? formatSeconds(phase.elapsedMs) : formatSeconds(phase.remainingMs);
  const stopEndsTheSeries = phase.kind === 'series' && phase.openEnded;

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
          {clock}
        </ThemedText>
        {setup.recordShots && phase.kind === 'series' && (
          <ShotList shots={shots} live testID="timer-live-shots" />
        )}
      </View>
      <PrimaryButton
        label={t('timer.stop')}
        onPress={stopEndsTheSeries ? stopSeries : reset}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  shotList: {
    gap: Spacing.half,
  },
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  numeric: {
    fontVariant: ['tabular-nums'],
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
