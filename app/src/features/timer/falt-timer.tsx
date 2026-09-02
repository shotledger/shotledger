// Fälttimer — the range officer's command sequence for fältskjutning, the
// third mode behind the Timer entry (plan.md "Timers"). Setup and run are
// two views of one screen, switched on the engine's phase, mirroring
// timer.tsx and ipsc-timer.tsx. All sequence logic lives in the pure
// `FaltTimerEngine` (shared/src/timer/falt.ts); this file is layout plus
// the settings editor.
import {
  DEFAULT_FALT_SETTINGS,
  MAX_PREP_SECONDS,
  MAX_SHOOTING_SECONDS,
  MIN_PREP_SECONDS,
  MIN_SHOOTING_SECONDS,
  SHOOTING_TIME_PRESETS,
  buildFaltPlan,
  type FaltCueKind,
  type FaltMode,
  type FaltPhaseKind,
  type FaltTimerSettings,
} from '@shotledger/shared';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { FaltTimeline } from '@/features/timer/falt-timeline';
import { useFaltTimer } from '@/features/timer/use-falt-timer';
import { useFaltSettings, useSpokenPrompts } from '@/features/timer/use-timer-settings';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing, type ThemeColor } from '@/theme/tokens';

const PREP_STEP_SECONDS = 5;

/** The commands as listed on screen, in the order they are given. */
const COMMAND_ORDER: readonly FaltCueKind[] = [
  'ladda',
  'allaKlara',
  'tenSeconds',
  'fardiga',
  'eld',
  'eldUpphor',
  'patronUr',
  'visitation',
];

const PHASE_COLOR: Record<FaltPhaseKind, ThemeColor> = {
  idle: 'textSecondary',
  prep: 'textSecondary',
  ready: 'primary',
  shooting: 'success',
  clearing: 'danger',
  done: 'primary',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Places a new parti boundary in the middle of the longest free stretch; returns the settings unchanged when every second is taken. */
export function withAddedEvent(settings: FaltTimerSettings): FaltTimerSettings {
  const taken = new Set(settings.eventSeconds);
  const bounds = [0, ...settings.eventSeconds, settings.shootingSeconds];
  let best: number | null = null;
  let bestGap = 0;
  for (let i = 1; i < bounds.length; i += 1) {
    const candidate = Math.floor((bounds[i - 1]! + bounds[i]!) / 2);
    const gap = bounds[i]! - bounds[i - 1]!;
    if (candidate > 0 && candidate < settings.shootingSeconds && !taken.has(candidate)) {
      if (gap > bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
  }
  if (best === null) return settings;
  return { ...settings, eventSeconds: [...settings.eventSeconds, best].sort((a, b) => a - b) };
}

/** Moves one boundary by `deltaSeconds`, refusing to land on 0, the end, or another boundary. */
export function withMovedEvent(
  settings: FaltTimerSettings,
  index: number,
  deltaSeconds: number,
): FaltTimerSettings {
  const current = settings.eventSeconds[index];
  if (current === undefined) return settings;
  const next = current + deltaSeconds;
  if (next <= 0 || next >= settings.shootingSeconds) return settings;
  if (settings.eventSeconds.includes(next)) return settings;
  const eventSeconds = settings.eventSeconds.map((second, i) => (i === index ? next : second));
  return { ...settings, eventSeconds: [...eventSeconds].sort((a, b) => a - b) };
}

/** Drops boundaries that a shorter shooting time has pushed outside the window. */
function withShootingSeconds(
  settings: FaltTimerSettings,
  shootingSeconds: number,
): FaltTimerSettings {
  const clamped = clamp(shootingSeconds, MIN_SHOOTING_SECONDS, MAX_SHOOTING_SECONDS);
  return {
    ...settings,
    shootingSeconds: clamped,
    eventSeconds: settings.eventSeconds.filter((second) => second < clamped),
  };
}

export interface FaltTimerProps {
  /** Rendered at the top of the setup view so the mode can be switched back. */
  modeSelector: ReactNode;
}

export function FaltTimer({ modeSelector }: FaltTimerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [settings, setSettings] = useFaltSettings(DEFAULT_FALT_SETTINGS);
  const [spokenPrompts, setSpokenPrompts] = useSpokenPrompts();
  const { phase, currentCue, isRunning, start, pause, resume, reset, markera } = useFaltTimer(
    settings,
    spokenPrompts,
  );
  const plan = useMemo(() => buildFaltPlan(settings), [settings]);

  const stepButton = useCallback(
    (label: string, accessibilityLabel: string, testID: string, onPress: () => void) => (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[styles.stepButton, { borderColor: theme.border }]}
      >
        <ThemedText type="smallBold">{label}</ThemedText>
      </Pressable>
    ),
    [theme.border],
  );

  if (phase.kind === 'idle') {
    return (
      <Screen>
        {modeSelector}

        <SegmentedControl<FaltMode>
          options={[
            { value: 'competition', label: t('faltTimer.modes.competition') },
            { value: 'training', label: t('faltTimer.modes.training') },
          ]}
          value={settings.mode}
          onChange={(mode) => setSettings({ ...settings, mode })}
          testID="falt-mode"
        />

        <Card style={styles.form} testID="falt-settings">
          {settings.mode === 'competition' && (
            <>
              <ThemedText type="smallBold">{t('faltTimer.prepTime')}</ThemedText>
              <View style={styles.row}>
                {stepButton('−', t('faltTimer.decreasePrep'), 'falt-prep-down', () =>
                  setSettings({
                    ...settings,
                    prepSeconds: clamp(
                      settings.prepSeconds - PREP_STEP_SECONDS,
                      MIN_PREP_SECONDS,
                      MAX_PREP_SECONDS,
                    ),
                  }),
                )}
                <ThemedText
                  type="smallBold"
                  style={[styles.flex, styles.value]}
                  testID="falt-prep-value"
                >
                  {t('faltTimer.seconds', { value: settings.prepSeconds })}
                </ThemedText>
                {stepButton('+', t('faltTimer.increasePrep'), 'falt-prep-up', () =>
                  setSettings({
                    ...settings,
                    prepSeconds: clamp(
                      settings.prepSeconds + PREP_STEP_SECONDS,
                      MIN_PREP_SECONDS,
                      MAX_PREP_SECONDS,
                    ),
                  }),
                )}
              </View>
            </>
          )}

          <ThemedText type="smallBold">{t('faltTimer.shootingTime')}</ThemedText>
          <View style={styles.row}>
            {stepButton('−', t('faltTimer.decreaseShooting'), 'falt-shooting-down', () =>
              setSettings(withShootingSeconds(settings, settings.shootingSeconds - 1)),
            )}
            <ThemedText
              type="smallBold"
              style={[styles.flex, styles.value]}
              testID="falt-shooting-value"
            >
              {t('faltTimer.seconds', { value: settings.shootingSeconds })}
            </ThemedText>
            {stepButton('+', t('faltTimer.increaseShooting'), 'falt-shooting-up', () =>
              setSettings(withShootingSeconds(settings, settings.shootingSeconds + 1)),
            )}
          </View>
          <View style={styles.row} testID="falt-shooting-presets">
            {SHOOTING_TIME_PRESETS.map((preset) => (
              <Pressable
                key={preset}
                onPress={() => setSettings(withShootingSeconds(settings, preset))}
                testID={`falt-preset-${preset}`}
              >
                <Chip
                  label={t('faltTimer.seconds', { value: preset })}
                  tone={settings.shootingSeconds === preset ? 'primary' : 'neutral'}
                />
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold">{t('faltTimer.events')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('faltTimer.eventsHint')}
          </ThemedText>
          {settings.eventSeconds.map((second, index) => (
            <View key={`${index}-${second}`} style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {t('faltTimer.eventNumber', { number: index + 1 })}
              </ThemedText>
              {stepButton('−', t('faltTimer.decreaseEvent'), `falt-event-${index}-down`, () =>
                setSettings(withMovedEvent(settings, index, -1)),
              )}
              <ThemedText type="smallBold" style={styles.value} testID={`falt-event-${index}`}>
                {t('faltTimer.seconds', { value: second })}
              </ThemedText>
              {stepButton('+', t('faltTimer.increaseEvent'), `falt-event-${index}-up`, () =>
                setSettings(withMovedEvent(settings, index, 1)),
              )}
            </View>
          ))}
          <View style={styles.row}>
            {stepButton('−', t('faltTimer.removeEvent'), 'falt-event-remove', () =>
              setSettings({ ...settings, eventSeconds: settings.eventSeconds.slice(0, -1) }),
            )}
            {stepButton('+', t('faltTimer.addEvent'), 'falt-event-add', () =>
              setSettings(withAddedEvent(settings)),
            )}
          </View>

          <View style={styles.switchRow}>
            <ThemedText type="small" style={styles.flex}>
              {t('faltTimer.whistle')}
            </ThemedText>
            <Switch
              value={settings.whistle}
              onValueChange={(whistle) => setSettings({ ...settings, whistle })}
              testID="falt-whistle"
            />
          </View>
          <View style={styles.switchRow}>
            <ThemedText type="small" style={styles.flex}>
              {t('faltTimer.spokenPrompts')}
            </ThemedText>
            <Switch
              value={spokenPrompts}
              onValueChange={setSpokenPrompts}
              testID="falt-spoken-prompts"
            />
          </View>
        </Card>

        <FaltTimeline plan={plan} elapsedMs={0} testID="falt-timeline-preview" />
        <ThemedText type="small" themeColor="textSecondary" testID="falt-source-note">
          {t('faltTimer.sourceNote')}
        </ThemedText>

        <PrimaryButton label={t('faltTimer.start')} onPress={start} testID="falt-start" />
      </Screen>
    );
  }

  const bigNumber =
    phase.kind === 'shooting'
      ? (phase.shootingRemainingMs / 1_000).toFixed(1)
      : phase.kind === 'clearing' || phase.kind === 'done'
        ? '—'
        : Math.ceil(phase.remainingMs / 1_000).toString();

  return (
    <Screen>
      <ThemedText
        type="title"
        themeColor={PHASE_COLOR[phase.kind]}
        style={styles.stateLabel}
        testID="falt-state-label"
      >
        {t(`faltTimer.state.${phase.kind}` as const)}
      </ThemedText>
      <ThemedText
        type="title"
        themeColor={PHASE_COLOR[phase.kind]}
        style={styles.clock}
        testID="falt-clock"
      >
        {bigNumber}
      </ThemedText>

      <FaltTimeline plan={plan} elapsedMs={phase.elapsedMs} testID="falt-timeline" />

      <Card style={styles.commandList} testID="falt-commands">
        {COMMAND_ORDER.filter((kind) => kind !== 'ladda' || settings.mode === 'competition').map(
          (kind) => (
            <ThemedText
              key={kind}
              type={currentCue === kind ? 'smallBold' : 'small'}
              themeColor={currentCue === kind ? 'primary' : 'textSecondary'}
              testID={`falt-command-${kind}`}
            >
              {t(`faltTimer.commands.${kind}` as const)}
            </ThemedText>
          ),
        )}
      </Card>

      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton
            label={isRunning ? t('faltTimer.pause') : t('faltTimer.resume')}
            onPress={isRunning ? pause : resume}
            testID="falt-pause"
          />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label={t('faltTimer.reset')} onPress={reset} testID="falt-reset" />
        </View>
      </View>
      {(phase.kind === 'clearing' || phase.kind === 'done') && (
        <PrimaryButton label={t('faltTimer.markera')} onPress={markera} testID="falt-markera" />
      )}
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
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  switchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  value: {
    textAlign: 'center',
    minWidth: 56,
    fontVariant: ['tabular-nums'],
  },
  stepButton: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandList: {
    gap: Spacing.one,
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
