// Horizontal level bar for the IPSC setup screen: current mic level, last
// peak, the tracked noise floor and the trigger that sits a chosen distance
// above it — so the shooter can clap or dry-fire and see where their setting
// falls relative to the room, which is what the detector actually compares
// against (#346).
import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/theme/tokens';

const BAR_HEIGHT = 24;
const MARKER_WIDTH = 3;

/** Scale ends. −60 dBFS is below any room the phone will be used in. */
const SCALE_MIN_DB = -60;
const SCALE_MAX_DB = 0;

function toPercent(db: number): number {
  const clamped = Math.min(SCALE_MAX_DB, Math.max(SCALE_MIN_DB, db));
  return ((clamped - SCALE_MIN_DB) / (SCALE_MAX_DB - SCALE_MIN_DB)) * 100;
}

export interface LevelMeterBarProps {
  /** Current mic level in dBFS, or null when metering isn't running. */
  currentDb: number | null;
  /** Highest level seen so far, or null when metering isn't running. */
  peakDb: number | null;
  /** The tracked noise floor, or null before the first window. */
  noiseFloorDb: number | null;
  /** Where the trigger currently sits, in dBFS: the floor plus the chosen excess. */
  thresholdDb: number | null;
  testID?: string;
}

/** Bar filled to the current level, with peak, noise-floor and trigger markers. */
export function LevelMeterBar({
  currentDb,
  peakDb,
  noiseFloorDb,
  thresholdDb,
  testID,
}: LevelMeterBarProps) {
  const theme = useTheme();
  const fillPercent = currentDb === null ? 0 : toPercent(currentDb);

  return (
    <ThemedView type="backgroundElement" style={styles.track} testID={testID}>
      <View style={[styles.fill, { width: `${fillPercent}%`, backgroundColor: theme.success }]} />
      {peakDb !== null && (
        <View
          style={[styles.marker, { left: `${toPercent(peakDb)}%`, backgroundColor: theme.text }]}
          testID={testID ? `${testID}-peak` : undefined}
        />
      )}
      {noiseFloorDb !== null && (
        <View
          style={[
            styles.marker,
            { left: `${toPercent(noiseFloorDb)}%`, backgroundColor: theme.textSecondary },
          ]}
          testID={testID ? `${testID}-floor` : undefined}
        />
      )}
      {thresholdDb !== null && (
        <View
          style={[
            styles.marker,
            { left: `${toPercent(thresholdDb)}%`, backgroundColor: theme.danger },
          ]}
          testID={testID ? `${testID}-threshold` : undefined}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  track: {
    height: BAR_HEIGHT,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: MARKER_WIDTH,
    marginLeft: -MARKER_WIDTH / 2,
  },
});
