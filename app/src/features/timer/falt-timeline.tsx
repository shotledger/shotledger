// The fälttimer's timeline. One horizontal bar for the whole program, drawn
// on the ELD-anchored clock: everything before ELD is at a negative second,
// the firing period is positive. Each numbered command is marked on the bar
// with its number from the list below it (maintainer, 2026-09-09: "Make a
// numbers list of commands and indicate those numbers on the time line"), and
// the parti (delmoment) intervals are badged above the shooting window, with
// their unit so a duration never reads as a command number.
import { ALLA_KLARA_AT_SECONDS, faltPartiIntervals, type FaltProgram } from '@shotledger/shared';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/**
 * The last 3 s of the shooting time — the drawn-out ELD UPPHÖR window. No
 * warning/amber token exists in the theme (tokens.ts has success/danger
 * only), so this one lives here; it is readable on both grounds.
 */
const AMBER = '#E8B84B';

const MARKER_SIZE = 20;
/** Wide enough for "120 s"; fixed so the badge can be centered on its interval. */
const BADGE_WIDTH = 44;

const startSecondsOf = (program: FaltProgram) => program.startSeconds;
const spanOf = (program: FaltProgram) => program.endSeconds - program.startSeconds;

export interface FaltTimelineProps {
  program: FaltProgram;
  /** Where the playhead sits, in ms relative to ELD. */
  atMs: number;
  /**
   * Scrub target. Supplied only while the clock is paused — the bar is inert
   * on a running timer, because a stray touch must not move a command
   * sequence people are acting on.
   */
  onSeek?: (atMs: number) => void;
  /** Announced for the scrub, when one is offered. */
  accessibilityLabel?: string;
  testID?: string;
}

export function FaltTimeline({
  program,
  atMs,
  onSeek,
  accessibilityLabel,
  testID,
}: FaltTimelineProps) {
  const [barWidth, setBarWidth] = useState(0);

  function onBarLayout(event: LayoutChangeEvent) {
    setBarWidth(event.nativeEvent.layout.width);
  }

  /** Touch x -> a position on the ELD-anchored clock. */
  function seekTo(x: number) {
    if (!onSeek || barWidth <= 0) return;
    const fraction = Math.min(1, Math.max(0, x / barWidth));
    onSeek((startSecondsOf(program) + fraction * spanOf(program)) * 1_000);
  }

  const { t } = useTranslation();
  const theme = useTheme();
  const { settings, startSeconds, endSeconds } = program;
  const shooting = settings.shootingSeconds;
  const span = endSeconds - startSeconds;
  /** Fraction of the bar's width for a second on the ELD-anchored clock. */
  const at = (second: number) => (span > 0 ? (second - startSeconds) / span : 0);

  const bounds = [
    startSeconds,
    Math.max(startSeconds, ALLA_KLARA_AT_SECONDS),
    0,
    Math.max(0, shooting - 3),
    shooting,
    endSeconds,
  ];
  const colors = [
    theme.backgroundSelected,
    theme.border,
    theme.success,
    AMBER,
    theme.danger,
  ] as const;
  const segments = colors
    .map((color, i) => ({ key: `seg-${i}`, weight: bounds[i + 1]! - bounds[i]!, color }))
    .filter((segment) => segment.weight > 0);

  // Each interval's badge sits over the middle of that stretch of the shooting
  // window. A single parti is the whole window, which the scale already labels.
  const intervals = faltPartiIntervals(settings);
  const showIntervals = intervals.length > 1;
  const partiBounds = [0, ...settings.partiSeconds, shooting];

  return (
    <View style={styles.wrapper} testID={testID}>
      {showIntervals && (
        <View style={styles.overlayRow}>
          {intervals.map((seconds, index) => (
            <View
              key={`parti-${index}`}
              style={[
                styles.badge,
                {
                  left: `${at((partiBounds[index]! + partiBounds[index + 1]!) / 2) * 100}%`,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                },
              ]}
              testID={`falt-interval-${index + 1}`}
            >
              <ThemedText type="small" style={styles.badgeText}>
                {t('faltTimer.seconds', { value: seconds })}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.overlayRow}>
        {program.commands
          .filter((command) => command.atSeconds !== null)
          .map((command) => (
            <View
              key={command.number}
              style={[
                styles.marker,
                {
                  left: `${at(command.atSeconds!) * 100}%`,
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
              testID={`falt-marker-${command.number}`}
            >
              <ThemedText type="small" style={styles.badgeText}>
                {command.number}
              </ThemedText>
            </View>
          ))}
      </View>

      <Pressable
        style={styles.bar}
        onLayout={onBarLayout}
        disabled={!onSeek}
        accessibilityRole={onSeek ? 'adjustable' : undefined}
        accessibilityLabel={onSeek ? accessibilityLabel : undefined}
        onPress={(event) => seekTo(event.nativeEvent.locationX)}
        testID={testID ? `${testID}-bar` : undefined}
      >
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={{ flex: segment.weight, backgroundColor: segment.color }}
            testID={`falt-${segment.key}`}
          />
        ))}
        <View
          pointerEvents="none"
          style={[
            styles.playhead,
            {
              left: `${Math.min(1, Math.max(0, at(atMs / 1_000))) * 100}%`,
              backgroundColor: theme.text,
            },
          ]}
          testID="falt-playhead"
        />
      </Pressable>

      <View style={styles.scaleRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.scaleText}>
          {startSeconds}s
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={[styles.scaleText, styles.scaleMark, { left: `${at(0) * 100}%` }]}
          testID="falt-scale-eld"
        >
          0s
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={[styles.scaleText, styles.scaleMark, { left: `${at(shooting) * 100}%` }]}
        >
          {shooting}s
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  overlayRow: {
    height: MARKER_SIZE + 2,
  },
  badge: {
    position: 'absolute',
    marginLeft: -BADGE_WIDTH / 2,
    width: BADGE_WIDTH,
    borderWidth: 1,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    height: MARKER_SIZE,
  },
  marker: {
    position: 'absolute',
    marginLeft: -MARKER_SIZE / 2,
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderWidth: 1,
    borderRadius: MARKER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontVariant: ['tabular-nums'],
  },
  bar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
  scaleRow: {
    height: 16,
  },
  scaleText: {
    fontVariant: ['tabular-nums'],
  },
  scaleMark: {
    position: 'absolute',
    marginLeft: -10,
  },
});
