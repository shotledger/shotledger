// Horizontal level bar for the IPSC setup screen: current mic level, last
// peak, and the chosen trigger threshold on one scale, so the shooter can
// clap/dry-fire and drop the threshold just under the peak.
import { MAX_TRIGGER_DB, MIN_TRIGGER_DB } from '@shotledger/shared';
import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/theme/tokens';

const BAR_HEIGHT = 24;
const MARKER_WIDTH = 3;

function toPercent(db: number): number {
  const clamped = Math.min(MAX_TRIGGER_DB, Math.max(MIN_TRIGGER_DB, db));
  return ((clamped - MIN_TRIGGER_DB) / (MAX_TRIGGER_DB - MIN_TRIGGER_DB)) * 100;
}

export interface LevelMeterBarProps {
  /** Current mic level in dBFS, or null when metering isn't running. */
  currentDb: number | null;
  /** Highest level seen so far, or null when metering isn't running. */
  peakDb: number | null;
  /** The trigger threshold in dBFS, drawn as a fixed line on the same scale. */
  thresholdDb: number;
  testID?: string;
}

/** Bar filled from MIN_TRIGGER_DB to the current level, with peak and threshold markers. */
export function LevelMeterBar({ currentDb, peakDb, thresholdDb, testID }: LevelMeterBarProps) {
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
      <View
        style={[
          styles.marker,
          { left: `${toPercent(thresholdDb)}%`, backgroundColor: theme.danger },
        ]}
        testID={testID ? `${testID}-threshold` : undefined}
      />
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
