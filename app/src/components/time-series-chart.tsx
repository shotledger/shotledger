// Hand-drawn time-series chart for the analytics report (x = session date).
// Plain react-native-svg, like group-plot.tsx / distribution-bar-chart.tsx —
// no charting library (victory-native and @shopify/react-native-skia are not
// in the lockfile).
//
// Responsive by viewBox: width="100%" with a fixed coordinate space, so the
// same chart fits any screen without measuring.
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export interface TimeSeriesPoint {
  /** Chart-space key, e.g. the session id. */
  key: string;
  /** ISO timestamp — only used for the x-axis labels. */
  startedAt: string;
  value: number;
}

export interface TimeSeriesChartProps extends ViewProps {
  points: readonly TimeSeriesPoint[];
  /** Formats a y-axis gridline label. */
  formatValue: (value: number) => string;
  /** Formats an x-axis date label. */
  formatDate: (iso: string) => string;
  emptyLabel: string;
}

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 180;
const PAD_LEFT = 38;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;
const GRID_LINES = 4;

const PLOT_WIDTH = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

/** Nudges a degenerate (all-equal) range so the line lands mid-plot. */
function axisRange(values: readonly number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max > min) return { min, max };
  const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
  return { min: min - pad, max: max + pad };
}

export function TimeSeriesChart({
  points,
  formatValue,
  formatDate,
  emptyLabel,
  style,
  ...rest
}: TimeSeriesChartProps) {
  const theme = useTheme();

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          {emptyLabel}
        </ThemedText>
      </View>
    );
  }

  const { min, max } = axisRange(points.map((point) => point.value));
  const span = max - min;

  const x = (index: number) =>
    points.length === 1
      ? PAD_LEFT + PLOT_WIDTH / 2
      : PAD_LEFT + (index / (points.length - 1)) * PLOT_WIDTH;
  const y = (value: number) => PAD_TOP + PLOT_HEIGHT - ((value - min) / span) * PLOT_HEIGHT;

  const coords = points.map((point, index) => ({ x: x(index), y: y(point.value) }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const area = `${PAD_LEFT},${PAD_TOP + PLOT_HEIGHT} ${line} ${coords.at(-1)!.x},${PAD_TOP + PLOT_HEIGHT}`;

  const gridValues = Array.from(
    { length: GRID_LINES + 1 },
    (_, index) => min + (span * index) / GRID_LINES,
  );

  // First, last, and — with enough points to be worth it — the middle one.
  const dateTicks =
    points.length === 1
      ? [0]
      : points.length < 4
        ? [0, points.length - 1]
        : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <View style={[styles.container, style]} {...rest} testID="time-series-chart">
      <Svg width="100%" height={VIEW_HEIGHT} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
        {gridValues.map((value) => (
          <Line
            key={`grid-${value}`}
            x1={PAD_LEFT}
            y1={y(value)}
            x2={VIEW_WIDTH - PAD_RIGHT}
            y2={y(value)}
            stroke={theme.border}
            strokeWidth={0.5}
            opacity={0.6}
          />
        ))}
        {gridValues.map((value) => (
          <SvgText
            key={`grid-label-${value}`}
            x={PAD_LEFT - 5}
            y={y(value) + 3.5}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor="end"
          >
            {formatValue(value)}
          </SvgText>
        ))}

        <Polygon points={area} fill={theme.primary} opacity={0.15} />
        <Polyline points={line} fill="none" stroke={theme.primary} strokeWidth={2} />
        {coords.map((c, index) => (
          <Circle key={points[index]!.key} cx={c.x} cy={c.y} r={2.5} fill={theme.primary} />
        ))}

        <Line
          x1={PAD_LEFT}
          y1={PAD_TOP + PLOT_HEIGHT}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={PAD_TOP + PLOT_HEIGHT}
          stroke={theme.border}
          strokeWidth={1}
        />
        {dateTicks.map((index, tick) => (
          <SvgText
            key={`date-${points[index]!.key}`}
            x={x(index)}
            y={VIEW_HEIGHT - 8}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor={tick === 0 ? 'start' : tick === dateTicks.length - 1 ? 'end' : 'middle'}
          >
            {formatDate(points[index]!.startedAt)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  empty: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
