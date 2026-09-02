// The fälttimer's timeline: one horizontal bar for the whole command plan,
// with the parti (delmoment) intervals badged above the shooting window.
// Deliberately not the benchmark app's dial — the maintainer settled that a
// bar is enough (plan.md).
import { ELD_UPPHOR_LEAD_SECONDS, faltEventIntervals, type FaltPlan } from '@shotledger/shared';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/**
 * The last 3 s of the shooting time — the drawn-out ELD UPPHÖR window. No
 * warning/amber token exists in the theme (tokens.ts has success/danger
 * only), so this one lives here; it is readable on both grounds.
 */
const AMBER = '#E8B84B';

export interface FaltTimelineProps {
  plan: FaltPlan;
  elapsedMs: number;
  testID?: string;
}

interface Segment {
  key: string;
  ms: number;
  color: string;
}

export function FaltTimeline({ plan, elapsedMs, testID }: FaltTimelineProps) {
  const theme = useTheme();
  const { settings, readyStartMs, eldAtMs, shootingEndMs, totalMs } = plan;
  const shootingMs = settings.shootingSeconds * 1_000;
  const tailMs = Math.min(shootingMs, ELD_UPPHOR_LEAD_SECONDS * 1_000);

  const segments: Segment[] = [
    // prep (competition only) and the 10 s countdown: both "not yet firing".
    { key: 'prep', ms: readyStartMs, color: theme.backgroundSelected },
    { key: 'ready', ms: eldAtMs - readyStartMs, color: theme.border },
    { key: 'shooting', ms: shootingMs - tailMs, color: theme.success },
    { key: 'tail', ms: tailMs, color: AMBER },
    { key: 'clearing', ms: totalMs - shootingEndMs, color: theme.danger },
  ].filter((segment) => segment.ms > 0);

  const intervals = faltEventIntervals(settings);
  const progress = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;

  return (
    <View style={styles.wrapper} testID={testID}>
      <View style={styles.badgeRow}>
        <View style={{ flex: eldAtMs }} />
        {intervals.map((seconds, index) => (
          <View
            key={`parti-${index}`}
            style={[styles.badge, { flex: seconds * 1_000, borderColor: theme.border }]}
            testID={`falt-parti-${index + 1}`}
          >
            <ThemedText type="small" style={styles.badgeText}>
              {seconds}
            </ThemedText>
          </View>
        ))}
        <View style={{ flex: totalMs - shootingEndMs }} />
      </View>

      <View style={styles.bar}>
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={{ flex: segment.ms, backgroundColor: segment.color }}
            testID={`falt-segment-${segment.key}`}
          />
        ))}
        <View
          pointerEvents="none"
          style={[styles.playhead, { left: `${progress * 100}%`, backgroundColor: theme.text }]}
          testID="falt-playhead"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 22,
  },
  badge: {
    borderWidth: 1,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
    height: 20,
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
});
