// Shot timer route (v3 backlog item, maintainer-approved scope expansion —
// plan.md "PAR/interval shot timer"). Setup (preset/custom picker) and
// running (countdown) are two views of one screen, switched on the engine's
// phase — `useTimer` (features/timer/use-timer.ts) drives the pure
// `TimerController`/`TimerEngine` (shared/src/timer).
//
// One route, two modes: the regular PAR/interval timer below and the
// microphone-driven IPSC timer in features/timer/ipsc-timer.tsx. The mode
// segmented control is rendered by whichever mode is active, in its setup
// view only — switching mid-run would strand a recorder or an interval.
import {
  PAR_PRESETS,
  buildMilsnabbDrillConfig,
  type TimerConfig,
  type TimerPhaseKind,
} from '@shotledger/shared';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { IpscTimer } from '@/features/timer/ipsc-timer';
import { useTimer } from '@/features/timer/use-timer';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, type ThemeColor } from '@/theme/tokens';

type PresetId = 'parSingle' | 'parRandomStart' | 'parInterval' | 'milsnabb' | 'custom';

const PAR_PRESET_BY_ID: Record<
  Exclude<PresetId, 'milsnabb' | 'custom'>,
  (typeof PAR_PRESETS)[number]
> = {
  parSingle: PAR_PRESETS[0]!,
  parRandomStart: PAR_PRESETS[1]!,
  parInterval: PAR_PRESETS[2]!,
};

const PRESET_IDS: readonly PresetId[] = [
  'parSingle',
  'parRandomStart',
  'parInterval',
  'milsnabb',
  'custom',
];

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

function buildCustomConfig(
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

type TimerMode = 'regular' | 'ipsc';

export default function ShotTimerScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimerMode>('regular');

  const modeSelector = (
    <SegmentedControl<TimerMode>
      options={[
        { value: 'regular', label: t('timer.modes.regular') },
        { value: 'ipsc', label: t('timer.modes.ipsc') },
      ]}
      value={mode}
      onChange={setMode}
      testID="timer-mode"
    />
  );

  return mode === 'ipsc' ? (
    <IpscTimer modeSelector={modeSelector} />
  ) : (
    <RegularTimer modeSelector={modeSelector} />
  );
}

function RegularTimer({ modeSelector }: { modeSelector: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [presetId, setPresetId] = useState<PresetId>('parSingle');
  const [parSeconds, setParSeconds] = useState('3');
  const [readyDelaySeconds, setReadyDelaySeconds] = useState('3');
  const [reps, setReps] = useState('1');
  const [restSeconds, setRestSeconds] = useState('0');

  const config = useMemo<TimerConfig>(() => {
    if (presetId === 'milsnabb') return buildMilsnabbDrillConfig();
    if (presetId === 'custom')
      return buildCustomConfig(parSeconds, readyDelaySeconds, reps, restSeconds);
    return PAR_PRESET_BY_ID[presetId].config;
  }, [presetId, parSeconds, readyDelaySeconds, reps, restSeconds]);

  const { phase, start, reset } = useTimer(config);
  const totalSeries = config.series.length;
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  if (phase.kind === 'idle') {
    return (
      <Screen>
        {modeSelector}
        <ThemedText type="smallBold">{t('timer.presetsTitle')}</ThemedText>
        <Card style={styles.presetList}>
          {PRESET_IDS.map((id) => (
            <ListRow
              key={id}
              testID={`timer-preset-${id}`}
              title={t(`timer.presets.${id}`)}
              subtitle={
                id === 'milsnabb'
                  ? t('timer.presetSummaryMilsnabb')
                  : id === 'custom'
                    ? t('timer.presetSummaryCustom')
                    : id === 'parInterval'
                      ? t('timer.presetSummaryInterval', {
                          reps: PAR_PRESET_BY_ID.parInterval.config.series.length,
                          par: formatSeconds(
                            PAR_PRESET_BY_ID.parInterval.config.series[0]!.durationMs,
                          ),
                          rest: formatSeconds(PAR_PRESET_BY_ID.parInterval.config.restMs),
                        })
                      : t('timer.presetSummaryPar', {
                          ready: formatSeconds(
                            PAR_PRESET_BY_ID[id].config.randomReadyDelay?.minMs ??
                              PAR_PRESET_BY_ID[id].config.readyDelayMs,
                          ),
                          par: formatSeconds(PAR_PRESET_BY_ID[id].config.series[0]!.durationMs),
                        })
              }
              trailing={
                presetId === id ? <ThemedText themeColor="primary">✓</ThemedText> : undefined
              }
              onPress={() => setPresetId(id)}
            />
          ))}
        </Card>

        {presetId === 'milsnabb' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('timer.milsnabbLegend')}
          </ThemedText>
        )}

        {presetId === 'custom' && (
          <Card style={styles.customForm} testID="timer-custom-form">
            <ThemedText type="smallBold">{t('timer.custom.parSeconds')}</ThemedText>
            <TextInput
              value={parSeconds}
              onChangeText={setParSeconds}
              keyboardType="decimal-pad"
              style={inputStyle}
              testID="timer-custom-par"
            />
            <ThemedText type="smallBold">{t('timer.custom.readyDelaySeconds')}</ThemedText>
            <TextInput
              value={readyDelaySeconds}
              onChangeText={setReadyDelaySeconds}
              keyboardType="decimal-pad"
              style={inputStyle}
              testID="timer-custom-ready"
            />
            <ThemedText type="smallBold">{t('timer.custom.reps')}</ThemedText>
            <TextInput
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              style={inputStyle}
              testID="timer-custom-reps"
            />
            <ThemedText type="smallBold">{t('timer.custom.restSeconds')}</ThemedText>
            <TextInput
              value={restSeconds}
              onChangeText={setRestSeconds}
              keyboardType="decimal-pad"
              style={inputStyle}
              testID="timer-custom-rest"
            />
          </Card>
        )}

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
  presetList: {
    gap: 0,
    padding: 0,
    paddingHorizontal: Spacing.three,
  },
  customForm: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
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
