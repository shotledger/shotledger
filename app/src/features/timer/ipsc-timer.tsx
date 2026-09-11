// IPSC-style shot timer view — the second mode behind the Timer entry.
// Setup, run and result are three views of one screen, switched on the
// engine's phase, mirroring timer.tsx's shape.
import {
  DEFAULT_IPSC_CONFIG,
  MAX_TRIGGER_DB,
  MIN_TRIGGER_DB,
  SENSITIVITY_THRESHOLD_DB,
  TRIGGER_DB_STEP,
  type IpscPhaseKind,
  type IpscTimerConfig,
  type ShotSensitivity,
} from '@shotledger/shared';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { RangeSlider } from '@/components/range-slider';
import { Slider } from '@/components/slider';
import { StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { LevelMeterBar } from '@/features/timer/level-meter-bar';
import { useIpscTimer, type IpscSpokenPrompts } from '@/features/timer/use-ipsc-timer';
import { useLevelMeter } from '@/features/timer/use-level-meter';
import { useSpokenPrompts } from '@/features/timer/use-timer-settings';
import { Spacing, type ThemeColor } from '@/theme/tokens';

const SENSITIVITIES: readonly ShotSensitivity[] = ['low', 'medium', 'high'];

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

export interface IpscTimerProps {
  /** Rendered at the top of the setup view so the mode can be switched back. */
  modeSelector: ReactNode;
}

/** Longest start delay the sliders offer — past this a random wait stops being a start signal. */
const DELAY_MAX_SECONDS = 10;

export function IpscTimer({ modeSelector }: IpscTimerProps) {
  const { t, i18n } = useTranslation();
  const [spokenPrompts, setSpokenPrompts] = useSpokenPrompts();

  // No settings store exists yet for the timer's other options (delay, PAR,
  // auto-stop are all component state too) — the trigger level lives here
  // alongside them rather than introducing persistence on its own.
  const [thresholdDb, setThresholdDb] = useState<number>(SENSITIVITY_THRESHOLD_DB.medium);
  const [delayMin, setDelayMin] = useState(1);
  const [delayMax, setDelayMax] = useState(4);
  const [parSeconds, setParSeconds] = useState('');
  const [autoStopSeconds, setAutoStopSeconds] = useState('10');
  // Paused as soon as Start is pressed so the setup meter's recorder never
  // overlaps the run's own (both use the same underlying mic listener).
  const [meteringPaused, setMeteringPaused] = useState(false);

  const config = useMemo<IpscTimerConfig>(() => {
    const minMs = Math.round(delayMin * 1_000);
    const maxMs = Math.max(minMs, Math.round(delayMax * 1_000));
    const par = seconds(parSeconds, 0);
    return {
      readyMs: DEFAULT_IPSC_CONFIG.readyMs,
      randomDelay: { minMs, maxMs },
      parMs: par > 0 ? Math.round(par * 1_000) : undefined,
      autoStopSilenceMs: Math.round(seconds(autoStopSeconds, 10) * 1_000),
      thresholdDb,
    };
  }, [delayMin, delayMax, parSeconds, autoStopSeconds, thresholdDb]);

  // Spoken in the app's current language — these are ordinary UI prompts,
  // not the fälttimer's SPSF-regulated Swedish commands.
  const prompts = useMemo<IpscSpokenPrompts | null>(
    () =>
      spokenPrompts
        ? {
            language: i18n.language.startsWith('sv') ? 'sv-SE' : 'en-US',
            ready: t('ipscTimer.state.ready'),
            standby: t('ipscTimer.state.standby'),
          }
        : null,
    [spokenPrompts, i18n.language, t],
  );

  const { phase, shots, summary, error, available, start, stop, reset } = useIpscTimer(
    config,
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

  const { currentDb, peakDb } = useLevelMeter(phase.kind === 'idle' && !meteringPaused);

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

        <ThemedText type="smallBold">{t('ipscTimer.settingsTitle')}</ThemedText>
        <Card style={styles.form} testID="ipsc-settings">
          <View style={styles.labelRow}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('ipscTimer.triggerLevel')}
            </ThemedText>
            <ThemedText type="smallBold" testID="ipsc-level-value">
              {t('ipscTimer.triggerLevelDb', { value: thresholdDb })}
            </ThemedText>
          </View>
          {/* The slider runs in sensitivity, not dBFS: the detector fires on
              `db >= threshold`, so a threshold near 0 demands a louder sound
              and is the LEAST sensitive end. Negating keeps "right is more
              sensitive", which is how the maintainer asked for it. */}
          <Slider
            value={-thresholdDb}
            min={-MAX_TRIGGER_DB}
            max={-MIN_TRIGGER_DB}
            step={TRIGGER_DB_STEP}
            onChange={(sensitivity) => setThresholdDb(-sensitivity)}
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
                onPress={() => setThresholdDb(SENSITIVITY_THRESHOLD_DB[preset])}
                testID={`ipsc-preset-${preset}`}
              >
                <Chip
                  label={t(`ipscTimer.sensitivities.${preset}` as const)}
                  tone={thresholdDb === SENSITIVITY_THRESHOLD_DB[preset] ? 'primary' : 'neutral'}
                />
              </Pressable>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('ipscTimer.sensitivityHint')}
          </ThemedText>

          {available ? (
            <>
              <ThemedText type="smallBold">{t('ipscTimer.liveMeter')}</ThemedText>
              <LevelMeterBar
                currentDb={currentDb}
                peakDb={peakDb}
                thresholdDb={thresholdDb}
                testID="ipsc-level-meter"
              />
              <ThemedText type="small" themeColor="textSecondary" testID="ipsc-level-meter-hint">
                {currentDb === null
                  ? t('ipscTimer.liveMeterNeedsPermission')
                  : t('ipscTimer.liveMeterHint')}
              </ThemedText>
            </>
          ) : null}

          <View style={styles.labelRow}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('ipscTimer.randomDelay')}
            </ThemedText>
            <ThemedText type="smallBold" testID="ipsc-delay-value">
              {t('ipscTimer.delayRange', { from: delayMin, to: delayMax })}
            </ThemedText>
          </View>
          {/* One track, two thumbs: the delay is a range, and two stacked
              sliders read as two unrelated settings. */}
          <RangeSlider
            low={delayMin}
            high={delayMax}
            min={0}
            max={DELAY_MAX_SECONDS}
            onChange={({ low, high }) => {
              setDelayMin(low);
              setDelayMax(high);
            }}
            lowAccessibilityLabel={t('ipscTimer.randomDelayMin')}
            highAccessibilityLabel={t('ipscTimer.randomDelayMax')}
            testID="ipsc-delay"
          />

          <ThemedText type="smallBold">{t('ipscTimer.parSeconds')}</ThemedText>
          <TextField
            value={parSeconds}
            onChangeText={setParSeconds}
            keyboardType="decimal-pad"
            placeholder={t('ipscTimer.parPlaceholder')}
            testID="ipsc-par"
          />

          <ThemedText type="smallBold">{t('ipscTimer.autoStopSeconds')}</ThemedText>
          <TextField
            value={autoStopSeconds}
            onChangeText={setAutoStopSeconds}
            keyboardType="decimal-pad"
            testID="ipsc-auto-stop"
          />

          <View style={styles.switchRow}>
            <ThemedText type="small" style={styles.flex}>
              {t('timer.spokenPrompts')}
            </ThemedText>
            <Switch
              value={spokenPrompts}
              onValueChange={setSpokenPrompts}
              testID="ipsc-spoken-prompts"
            />
          </View>
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
