// Fälttimer — the range officer's command sequence for fältskjutning, the
// third mode behind the Timer entry. Setup and run are
// two views of one screen, switched on the engine's phase, mirroring
// timer.tsx and ipsc-timer.tsx. All sequence logic lives in the pure
// `FaltTimerEngine` (shared/src/timer/falt.ts); this file is layout plus
// the settings editor.
//
// The commands themselves stay Swedish in both app languages — "Ladda",
// "Alla klara", "Tio sekunder kvar" are what is called on the line at a
// Swedish match, so they come from `faltCommandText`, not the i18n
// catalogues; the chrome around them is translated as usual.
import {
  DEFAULT_FALT_SETTINGS,
  MAX_LADDA_SECONDS,
  MAX_SHOOTING_SECONDS,
  MAX_SHOOTING_SLIDER_SECONDS,
  MIN_LADDA_SECONDS,
  MIN_SHOOTING_SECONDS,
  SHOOTING_TIME_PRESETS,
  buildFaltProgram,
  faltCommandText,
  type FaltMode,
  type FaltProgram,
  type FaltTimerSettings,
} from '@shotledger/shared';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { InfoButton } from '@/components/info-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Slider } from '@/components/slider';
import { ThemedText } from '@/components/themed-text';
import { FaltTimeline } from '@/features/timer/falt-timeline';
import { useFaltTimer } from '@/features/timer/use-falt-timer';
import { useFaltSettings, useSpokenPrompts } from '@/features/timer/use-timer-settings';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Places a new parti boundary in the middle of the longest free stretch; returns the settings unchanged when every second is taken. */
export function withAddedParti(settings: FaltTimerSettings): FaltTimerSettings {
  const taken = new Set(settings.partiSeconds);
  const bounds = [0, ...settings.partiSeconds, settings.shootingSeconds];
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
  return { ...settings, partiSeconds: [...settings.partiSeconds, best].sort((a, b) => a - b) };
}

/** Moves one boundary by `deltaSeconds`, refusing to land on 0, the end, or another boundary. */
export function withMovedParti(
  settings: FaltTimerSettings,
  index: number,
  deltaSeconds: number,
): FaltTimerSettings {
  const current = settings.partiSeconds[index];
  if (current === undefined) return settings;
  const next = current + deltaSeconds;
  if (next <= 0 || next >= settings.shootingSeconds) return settings;
  if (settings.partiSeconds.includes(next)) return settings;
  const partiSeconds = settings.partiSeconds.map((second, i) => (i === index ? next : second));
  return { ...settings, partiSeconds: [...partiSeconds].sort((a, b) => a - b) };
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
    partiSeconds: settings.partiSeconds.filter((second) => second < clamped),
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
  const {
    phase,
    currentNumber,
    isRunning,
    isAwaitingPress,
    start,
    advanceManual,
    pause,
    resume,
    seek,
    isPaused,
    reset,
    restart,
  } = useFaltTimer(settings, spokenPrompts);
  const program = useMemo(() => buildFaltProgram(settings), [settings]);

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
            { value: 'rangeOfficer', label: t('faltTimer.modes.rangeOfficer') },
            { value: 'solo', label: t('faltTimer.modes.solo') },
          ]}
          value={settings.mode}
          onChange={(mode) => setSettings({ ...settings, mode })}
          testID="falt-mode"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t(`faltTimer.modeHint.${settings.mode}` as const)}
        </ThemedText>

        <Card style={styles.form} testID="falt-settings">
          <View style={styles.labelRow}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('faltTimer.shootingTime')}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.value} testID="falt-shooting-value">
              {t('faltTimer.seconds', { value: settings.shootingSeconds })}
            </ThemedText>
          </View>
          <Slider
            value={settings.shootingSeconds}
            min={MIN_SHOOTING_SECONDS}
            max={MAX_SHOOTING_SLIDER_SECONDS}
            onChange={(seconds) => setSettings(withShootingSeconds(settings, seconds))}
            accessibilityLabel={t('faltTimer.shootingTime')}
            testID="falt-shooting-slider"
          />
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

          {settings.mode === 'solo' && (
            <>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {t('faltTimer.laddaTime')}
                </ThemedText>
                <ThemedText type="smallBold" style={styles.value} testID="falt-ladda-value">
                  {t('faltTimer.seconds', { value: settings.laddaSeconds })}
                </ThemedText>
              </View>
              <Slider
                value={settings.laddaSeconds}
                min={MIN_LADDA_SECONDS}
                max={MAX_LADDA_SECONDS}
                onChange={(laddaSeconds) => setSettings({ ...settings, laddaSeconds })}
                accessibilityLabel={t('faltTimer.laddaTime')}
                testID="falt-ladda-slider"
              />
            </>
          )}

          <View style={styles.labelRow}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('faltTimer.partier')}
            </ThemedText>
            <InfoButton
              title={t('faltTimer.partier')}
              body={t('faltTimer.partierHint')}
              testID="falt-partier-info"
            />
          </View>
          {settings.partiSeconds.map((second, index) => (
            <View key={`${index}-${second}`} style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {faltCommandText({ kind: 'parti', partiNumber: index + 1 })}
              </ThemedText>
              {stepButton('−', t('faltTimer.decreaseParti'), `falt-parti-${index}-down`, () =>
                setSettings(withMovedParti(settings, index, -1)),
              )}
              <ThemedText type="smallBold" style={styles.value} testID={`falt-parti-${index}`}>
                {t('faltTimer.seconds', { value: second })}
              </ThemedText>
              {stepButton('+', t('faltTimer.increaseParti'), `falt-parti-${index}-up`, () =>
                setSettings(withMovedParti(settings, index, 1)),
              )}
            </View>
          ))}
          <View style={styles.row}>
            {stepButton('−', t('faltTimer.removeParti'), 'falt-parti-remove', () =>
              setSettings({ ...settings, partiSeconds: settings.partiSeconds.slice(0, -1) }),
            )}
            {stepButton('+', t('faltTimer.addParti'), 'falt-parti-add', () =>
              setSettings(withAddedParti(settings)),
            )}
          </View>

          <View style={styles.labelRow}>
            <ThemedText type="small" style={styles.flex}>
              {t('faltTimer.whistle')}
            </ThemedText>
            <Switch
              value={settings.whistle}
              onValueChange={(whistle) => setSettings({ ...settings, whistle })}
              testID="falt-whistle"
            />
          </View>
          <View style={styles.labelRow}>
            <ThemedText type="small" style={styles.flex}>
              {t('faltTimer.vibration')}
            </ThemedText>
            <Switch
              value={settings.vibration}
              onValueChange={(vibration) => setSettings({ ...settings, vibration })}
              testID="falt-vibration"
            />
          </View>
          <View style={styles.labelRow}>
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

        <View style={styles.labelRow}>
          <ThemedText type="smallBold" style={styles.flex}>
            {t('faltTimer.commandsTitle')}
          </ThemedText>
          <InfoButton
            title={t('faltTimer.commandsTitle')}
            body={t('faltTimer.sourceNote')}
            testID="falt-source-info"
          />
        </View>
        <FaltTimeline program={program} atMs={program.startSeconds * 1_000} testID="falt-preview" />
        <CommandList program={program} currentNumber={null} />

        <PrimaryButton label={t('faltTimer.start')} onPress={start} testID="falt-start" />
      </Screen>
    );
  }

  const current = program.commands.find((command) => command.number === currentNumber);
  const clock =
    phase.kind === 'shooting'
      ? (phase.shootingRemainingMs / 1_000).toFixed(1)
      : phase.kind === 'clearing' || phase.kind === 'done'
        ? '—'
        : `−${Math.ceil(phase.toEldMs / 1_000)}`;

  return (
    <Screen>
      <ThemedText
        type="title"
        themeColor={phase.kind === 'shooting' ? 'success' : 'primary'}
        style={styles.commandLine}
        testID="falt-current-command"
      >
        {current ? faltCommandText(current) : ''}
      </ThemedText>
      <ThemedText
        type="title"
        themeColor={phase.kind === 'shooting' ? 'success' : 'textSecondary'}
        style={styles.clock}
        testID="falt-clock"
      >
        {isAwaitingPress ? '—' : clock}
      </ThemedText>

      <FaltTimeline
        program={program}
        atMs={phase.atMs}
        onSeek={isPaused ? seek : undefined}
        accessibilityLabel={t('faltTimer.scrub')}
        testID="falt-timeline"
      />
      {isPaused && (
        <ThemedText type="small" themeColor="textSecondary" testID="falt-scrub-hint">
          {t('faltTimer.scrubHint')}
        </ThemedText>
      )}

      <CommandList
        program={program}
        currentNumber={currentNumber}
        onJump={isPaused ? seek : undefined}
      />

      {isAwaitingPress ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" testID="falt-press-hint">
            {t('faltTimer.pressHint')}
          </ThemedText>
          <PrimaryButton
            label={
              phase.kind === 'ladda'
                ? t('faltTimer.allaKlaraButton')
                : t('faltTimer.startCountdownButton')
            }
            onPress={advanceManual}
            testID="falt-advance"
          />
        </>
      ) : (
        phase.kind !== 'done' && (
          <PrimaryButton
            label={isRunning ? t('faltTimer.pause') : t('faltTimer.resume')}
            onPress={isRunning ? pause : resume}
            testID="falt-pause"
          />
        )
      )}
      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton label={t('faltTimer.restart')} onPress={restart} testID="falt-restart" />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label={t('faltTimer.settings')} onPress={reset} testID="falt-reset" />
        </View>
      </View>
    </Screen>
  );
}

/** The numbered command list — the numbers are what the timeline marks. */
function CommandList({
  program,
  currentNumber,
  onJump,
}: {
  program: FaltProgram;
  currentNumber: number | null;
  /** Supplied only while paused — tapping a command jumps the clock to it. */
  onJump?: (atMs: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card style={styles.commandList} testID="falt-commands">
      {program.commands.map((command) => {
        const active = command.number === currentNumber;
        // Only the timed commands can be jumped to: the two range-officer
        // ones happen on a press, so they have no position on the clock.
        const jumpable = onJump !== undefined && command.atSeconds !== null;
        return (
          <Pressable
            key={command.number}
            style={styles.labelRow}
            disabled={!jumpable}
            accessibilityRole={jumpable ? 'button' : undefined}
            onPress={() => onJump?.(command.atSeconds! * 1_000)}
            testID={`falt-command-row-${command.number}`}
          >
            <ThemedText
              type={active ? 'smallBold' : 'small'}
              themeColor={active ? 'primary' : 'textSecondary'}
              style={styles.commandNumber}
            >
              {command.number}.
            </ThemedText>
            <ThemedText
              type={active ? 'smallBold' : 'small'}
              themeColor={active ? 'primary' : 'text'}
              style={styles.flex}
              testID={`falt-command-${command.number}`}
            >
              {faltCommandText(command)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.commandTime}>
              {command.atSeconds === null
                ? t('faltTimer.onPress')
                : command.durationSeconds > 0
                  ? t('faltTimer.secondsRange', {
                      from: command.atSeconds,
                      to: command.atSeconds + command.durationSeconds,
                    })
                  : t('faltTimer.seconds', { value: command.atSeconds })}
            </ThemedText>
          </Pressable>
        );
      })}
    </Card>
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
  labelRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  value: {
    textAlign: 'right',
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
  commandNumber: {
    minWidth: 22,
    fontVariant: ['tabular-nums'],
  },
  commandTime: {
    minWidth: 64,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  commandLine: {
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
