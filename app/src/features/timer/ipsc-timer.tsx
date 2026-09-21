// IPSC-style shot timer view — the second mode behind the Timer entry.
// Setup, run and result are three views of one screen, switched on the
// engine's phase, mirroring timer.tsx's shape.
import {
  DEFAULT_IPSC_CONFIG,
  DEFAULT_IPSC_SETTINGS,
  IPSC_DELAY_MAX_SECONDS,
  MAX_TRIGGER_EXCESS_DB,
  MIN_TRIGGER_EXCESS_DB,
  SENSITIVITY_PRESETS,
  TIMER_CUE_MODES,
  TRIGGER_EXCESS_STEP_DB,
  ipscConfigFromSettings,
  type IpscPhaseKind,
  type IpscTimerSettings,
  type ShotSensitivity,
  type TimerCueMode,
} from '@shotledger/shared';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { InfoButton } from '@/components/info-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { RangeSlider } from '@/components/range-slider';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { LevelMeterBar } from '@/features/timer/level-meter-bar';
import { useIpscTimer, type IpscSpokenPrompts } from '@/features/timer/use-ipsc-timer';
import { useLevelMeter } from '@/features/timer/use-level-meter';
import { TimerMenu } from '@/features/timer/timer-menu';
import { useIpscSettings } from '@/features/timer/use-timer-settings';
import { Spacing, type ThemeColor } from '@/theme/tokens';

const SENSITIVITIES: readonly ShotSensitivity[] = ['low', 'medium', 'high'];

/** Copied to a plain array so the JSX map is not typed as `readonly`. */
const CUE_MODE_OPTIONS: TimerCueMode[] = [...TIMER_CUE_MODES];

const PHASE_COLOR: Record<IpscPhaseKind, ThemeColor> = {
  idle: 'textSecondary',
  ready: 'primary',
  standby: 'primary',
  running: 'success',
  done: 'primary',
};

function seconds(value: string, fallback: number): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatSeconds(ms: number | undefined): string {
  return ms === undefined ? '—' : (ms / 1_000).toFixed(2);
}

/** Stored seconds as field text; 0 means "off" for both PAR and auto-stop, which reads as an empty field. */
function secondsText(value: number): string {
  return value > 0 ? String(value) : '';
}

export interface IpscTimerProps {
  /** Rendered at the top of the setup view so the mode can be switched back. */
  modeSelector: ReactNode;
}

export function IpscTimer({ modeSelector }: IpscTimerProps) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useIpscSettings();
  const { triggerExcessDb, maxEventMs, delayMinSeconds, delayMaxSeconds } = settings;

  // The two numeric fields keep their own text, so a half-typed "1." stays on
  // screen while the stored setting holds the parsed seconds.
  const [parText, setParText] = useState(() => secondsText(settings.parSeconds));
  const [autoStopText, setAutoStopText] = useState(() => secondsText(settings.autoStopSeconds));
  // Paused as soon as Start is pressed so the setup meter's recorder never
  // overlaps the run's own (both use the same underlying mic listener).
  const [meteringPaused, setMeteringPaused] = useState(false);
  // Collapsed by default: the detection options are tuned once and then
  // left alone, so they should not push the timer's own settings down the
  // screen on every visit.
  const [detectionOpen, setDetectionOpen] = useState(false);

  const update = useCallback(
    (patch: Partial<IpscTimerSettings>) => setSettings({ ...settings, ...patch }),
    [settings, setSettings],
  );

  const config = useMemo(
    () => ipscConfigFromSettings(settings, DEFAULT_IPSC_CONFIG.readyMs),
    [settings],
  );

  // Spoken in the app's current language — these are ordinary UI prompts,
  // not the fälttimer's SPSF-regulated Swedish commands.
  const prompts = useMemo<IpscSpokenPrompts>(
    () => ({
      language: i18n.language.startsWith('sv') ? 'sv-SE' : 'en-US',
      ready: t('ipscTimer.state.ready'),
      standby: t('ipscTimer.state.standby'),
    }),
    [i18n.language, t],
  );

  const { phase, shots, summary, error, available, start, stop, reset } = useIpscTimer(
    config,
    settings,
    prompts,
  );

  // Un-pauses the setup meter once the phase is back to idle (a fresh mount,
  // or after reset()/a failed start put it there) — adjusting state during
  // render rather than in an effect, per the "storing info from previous
  // renders" pattern (react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [previousPhaseKind, setPreviousPhaseKind] = useState(phase.kind);
  if (previousPhaseKind !== phase.kind) {
    setPreviousPhaseKind(phase.kind);
    if (phase.kind === 'idle' && meteringPaused) setMeteringPaused(false);
  }

  const handleStart = useCallback(() => {
    setMeteringPaused(true);
    start();
  }, [start]);

  const gate = useMemo(() => ({ triggerExcessDb, maxEventMs }), [triggerExcessDb, maxEventMs]);
  const { currentDb, peakDb, noiseFloorDb, detectedCount } = useLevelMeter(
    phase.kind === 'idle' && !meteringPaused,
    gate,
  );

  const shotList =
    shots.length === 0 ? (
      <ThemedText type="small" themeColor="textSecondary" testID="ipsc-no-shots">
        {t('ipscTimer.noShots')}
      </ThemedText>
    ) : (
      <View style={styles.shotList} testID="ipsc-shot-list">
        {shots.map((shot) => (
          <View key={shot.index} style={styles.shotRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('ipscTimer.shotNumber', { number: shot.index + 1 })}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.numeric}>
              {t('ipscTimer.shotAt', { time: formatSeconds(shot.atMs) })}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.numeric}>
              {t('ipscTimer.split', { time: formatSeconds(shot.splitMs) })}
            </ThemedText>
          </View>
        ))}
      </View>
    );

  if (phase.kind === 'idle') {
    return (
      <Screen>
        {modeSelector}

        <View style={styles.labelRow}>
          <ThemedText type="smallBold" style={styles.flex}>
            {t('ipscTimer.settingsTitle')}
          </ThemedText>
          <TimerMenu />
        </View>
        <Card style={styles.form} testID="ipsc-settings">
          <DrillDownRow
            title={t('ipscTimer.shotDetection')}
            value={t('ipscTimer.triggerExcessDb', { value: triggerExcessDb })}
            expanded={detectionOpen}
            onPress={() => setDetectionOpen((open) => !open)}
            testID="ipsc-detection-row"
          />
          {detectionOpen && (
            <>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {t('ipscTimer.triggerLevel')}
                </ThemedText>
                <InfoButton
                  title={t('ipscTimer.triggerLevel')}
                  body={t('ipscTimer.sensitivityHint')}
                  testID="ipsc-sensitivity-info"
                />
              </View>
              {/* The slider runs in sensitivity, not in the stored number: a
              larger excess demands a louder sound over the room and is the
              LEAST sensitive end. Negating keeps "right is more sensitive",
              which is how the maintainer asked for it. */}
              <Slider
                value={-triggerExcessDb}
                min={-MAX_TRIGGER_EXCESS_DB}
                max={-MIN_TRIGGER_EXCESS_DB}
                step={TRIGGER_EXCESS_STEP_DB}
                onChange={(sensitivity) => update({ triggerExcessDb: -sensitivity })}
                accessibilityLabel={t('ipscTimer.triggerLevel')}
                testID="ipsc-level-slider"
              />
              <View style={styles.labelRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('ipscTimer.sensitivityLow')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('ipscTimer.sensitivityHigh')}
                </ThemedText>
              </View>

              <View style={styles.row} testID="ipsc-presets">
                {SENSITIVITIES.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => update(SENSITIVITY_PRESETS[preset])}
                    testID={`ipsc-preset-${preset}`}
                  >
                    <Chip
                      label={t(`ipscTimer.sensitivities.${preset}` as const)}
                      tone={
                        triggerExcessDb === SENSITIVITY_PRESETS[preset].triggerExcessDb &&
                        maxEventMs === SENSITIVITY_PRESETS[preset].maxEventMs
                          ? 'primary'
                          : 'neutral'
                      }
                    />
                  </Pressable>
                ))}
              </View>

              {available ? (
                <>
                  <ThemedText type="smallBold">{t('ipscTimer.liveMeter')}</ThemedText>
                  <LevelMeterBar
                    currentDb={currentDb}
                    peakDb={peakDb}
                    noiseFloorDb={noiseFloorDb}
                    thresholdDb={noiseFloorDb === null ? null : noiseFloorDb + triggerExcessDb}
                    testID="ipsc-level-meter"
                  />
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    testID="ipsc-level-meter-hint"
                  >
                    {currentDb === null
                      ? t('ipscTimer.liveMeterNeedsPermission')
                      : t('ipscTimer.liveMeterHint')}
                  </ThemedText>
                  {/* The count is the only honest answer to "will it hear my
                      shot?": the meter shows a level, this shows what the gate
                      did with it. */}
                  {currentDb !== null && (
                    <ThemedText type="smallBold" testID="ipsc-detected-shots">
                      {t('ipscTimer.detectedShots', { value: detectedCount })}
                    </ThemedText>
                  )}
                </>
              ) : null}
            </>
          )}

          <View style={styles.labelRow}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('ipscTimer.randomDelay')}
            </ThemedText>
            <ThemedText type="smallBold" testID="ipsc-delay-value">
              {t('ipscTimer.delayRange', { from: delayMinSeconds, to: delayMaxSeconds })}
            </ThemedText>
          </View>
          {/* One track, two thumbs: the delay is a range, and two stacked
              sliders read as two unrelated settings. */}
          <RangeSlider
            low={delayMinSeconds}
            high={delayMaxSeconds}
            min={0}
            max={IPSC_DELAY_MAX_SECONDS}
            onChange={({ low, high }) => update({ delayMinSeconds: low, delayMaxSeconds: high })}
            lowAccessibilityLabel={t('ipscTimer.randomDelayMin')}
            highAccessibilityLabel={t('ipscTimer.randomDelayMax')}
            testID="ipsc-delay"
          />

          <ThemedText type="smallBold">{t('ipscTimer.parSeconds')}</ThemedText>
          <TextField
            value={parText}
            onChangeText={(text) => {
              setParText(text);
              update({ parSeconds: seconds(text, DEFAULT_IPSC_SETTINGS.parSeconds) });
            }}
            keyboardType="decimal-pad"
            placeholder={t('ipscTimer.parPlaceholder')}
            testID="ipsc-par"
          />

          <ThemedText type="smallBold">{t('ipscTimer.autoStopSeconds')}</ThemedText>
          <TextField
            value={autoStopText}
            onChangeText={(text) => {
              setAutoStopText(text);
              update({ autoStopSeconds: seconds(text, DEFAULT_IPSC_SETTINGS.autoStopSeconds) });
            }}
            keyboardType="decimal-pad"
            testID="ipsc-auto-stop"
          />

          <ThemedText type="smallBold">{t('timer.cuesTitle')}</ThemedText>
          <SegmentedControl<TimerCueMode>
            options={CUE_MODE_OPTIONS.map((mode) => ({
              value: mode,
              label: t(`timer.cueMode.${mode}` as const),
            }))}
            value={settings.cueMode}
            onChange={(cueMode) => update({ cueMode })}
            testID="ipsc-cue-mode"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('ipscTimer.cuesHint')}
          </ThemedText>
          {/* Spoken prompts are a kind of sound, so the switch has nothing to
              do while the cues are vibration only — hidden rather than shown
              doing nothing. */}
          {settings.cueMode !== 'vibrate' && (
            <View style={styles.switchRow}>
              <ThemedText type="small" style={styles.flex}>
                {t('timer.spokenPrompts')}
              </ThemedText>
              <Switch
                value={settings.spokenPrompts}
                onValueChange={(spokenPrompts) => update({ spokenPrompts })}
                testID="ipsc-spoken-prompts"
              />
            </View>
          )}
        </Card>

        <ThemedText type="small" themeColor="textSecondary" testID="ipsc-privacy-note">
          {t('ipscTimer.privacyNote')}
        </ThemedText>

        {!available && (
          <ThemedText type="small" themeColor="danger" testID="ipsc-unavailable">
            {t('ipscTimer.webUnavailable')}
          </ThemedText>
        )}
        {error !== null && (
          <ThemedText type="small" themeColor="danger" testID="ipsc-error">
            {t(`ipscTimer.errors.${error}` as const)}
          </ThemedText>
        )}

        <PrimaryButton label={t('ipscTimer.start')} onPress={handleStart} testID="ipsc-start" />
      </Screen>
    );
  }

  if (phase.kind === 'done') {
    return (
      <Screen>
        <ThemedText type="smallBold">{t('ipscTimer.resultTitle')}</ThemedText>
        <View style={styles.row}>
          <StatTile
            label={t('ipscTimer.firstShot')}
            value={formatSeconds(summary?.firstShotMs)}
            testID="ipsc-first-shot"
          />
          <StatTile
            label={t('ipscTimer.total')}
            value={formatSeconds(summary?.totalMs)}
            testID="ipsc-total"
          />
          <StatTile
            label={t('ipscTimer.shotCount')}
            value={String(summary?.shotCount ?? 0)}
            testID="ipsc-count"
          />
        </View>
        {summary?.parOverrunMs !== undefined && (
          <ThemedText type="small" themeColor="danger" testID="ipsc-par-overrun">
            {t('ipscTimer.parOverrun', { time: formatSeconds(summary.parOverrunMs) })}
          </ThemedText>
        )}
        <Card>{shotList}</Card>
        <PrimaryButton label={t('ipscTimer.reset')} onPress={reset} testID="ipsc-reset" />
      </Screen>
    );
  }

  const running = phase.kind === 'running';

  return (
    <Screen>
      <ThemedText
        type="title"
        themeColor={PHASE_COLOR[phase.kind]}
        style={styles.stateLabel}
        testID="ipsc-state-label"
      >
        {t(`ipscTimer.state.${phase.kind}` as const)}
      </ThemedText>
      <ThemedText
        type="title"
        themeColor={PHASE_COLOR[phase.kind]}
        style={styles.clock}
        testID="ipsc-clock"
      >
        {running ? formatSeconds(phase.runElapsedMs) : '—'}
      </ThemedText>
      {running && <Card>{shotList}</Card>}
      <PrimaryButton
        label={t('ipscTimer.stop')}
        onPress={running ? stop : reset}
        testID="ipsc-stop"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  shotList: {
    gap: Spacing.one,
  },
  shotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  numeric: {
    fontVariant: ['tabular-nums'],
  },
  stateLabel: {
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  clock: {
    fontSize: 72,
    lineHeight: 78,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
