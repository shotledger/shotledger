// M5: rolling per-session trend, plain react-native-svg (§ M5 report —
// victory-native's peer chain (@shopify/react-native-skia + reanimated
// native rebuild) was disproportionate for two simple charts; svg is a
// single lightweight dependency with solid react-native-web support).
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import type { SessionTrendPoint } from '@shotledger/shared';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export interface TrendLineChartProps extends ViewProps {
  points: readonly SessionTrendPoint[];
  height?: number;
}

const DEFAULT_HEIGHT = 140;
const PADDING = 12;

/** Deterministic layout: a fixed viewBox scaled by point count, no animation. */
export function TrendLineChart({
  points,
  height = DEFAULT_HEIGHT,
  style,
  ...rest
}: TrendLineChartProps) {
  const theme = useTheme();
  const width = Math.max(points.length * 24, 200);

  if (points.length === 0) {
    return null;
  }

  const values = points.map((point) => point.meanTenths);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const usableWidth = width - PADDING * 2;
  const usableHeight = height - PADDING * 2;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? PADDING + usableWidth / 2
        : PADDING + (index / (points.length - 1)) * usableWidth;
    const y = PADDING + usableHeight - ((point.meanTenths - min) / range) * usableHeight;
    return { x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <View style={[styles.container, style]} {...rest} testID="trend-chart">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={PADDING}
          y1={height - PADDING}
          x2={width - PADDING}
          y2={height - PADDING}
          stroke={theme.border}
          strokeWidth={1}
        />
        <Polyline points={polylinePoints} fill="none" stroke={theme.primary} strokeWidth={2} />
        {coords.map((c, index) => (
          <Circle key={points[index]!.sessionId} cx={c.x} cy={c.y} r={3} fill={theme.primary} />
        ))}
      </Svg>
    </View>
  );
}

export function TrendLineChartEmpty({ label }: { label: string }) {
  return (
    <View style={styles.emptyContainer}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
