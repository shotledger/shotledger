// Hand-drawn time-series chart for the analytics report (x = session date).
// Plain react-native-svg, like group-plot.tsx / distribution-bar-chart.tsx —
// no charting library (victory-native and @shopify/react-native-skia are not
// in the lockfile).
//
// Responsive by viewBox: width="100%" with a fixed coordinate space, so the
// same chart fits any screen without measuring.
//
// Takes LINES, not one series: a precision session (max 350) and a milsnabb
// session (max 600) on one axis make a saw-tooth that means nothing, so each
// discipline gets its own (#349). The geometry lives in
// time-series-chart-math.ts so it can be tested without rendering.
import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';
import {
  axisNeedsYear,
  MAX_DOTS,
  timeExtent,
  timeScale,
  type TimeSeriesLine,
  type TimeSeriesPoint,
} from '@/components/time-series-chart-math';

export type { TimeSeriesLine, TimeSeriesPoint };

export interface TimeSeriesChartProps extends ViewProps {
  lines: readonly TimeSeriesLine[];
  /** Formats a y-axis gridline label. */
  formatValue: (value: number) => string;
  /** Formats an x-axis date label. `withYear` when the range crosses one. */
  formatDate: (iso: string, withYear: boolean) => string;
  emptyLabel: string;
  /** Rendered under the legend when the palette could not cover everything. */
  omittedLabel?: string | null;
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
  lines,
  formatValue,
  formatDate,
  emptyLabel,
  omittedLabel,
  style,
  ...rest
}: TimeSeriesChartProps) {
  const theme = useTheme();
  const allPoints = lines.flatMap((line) => line.points);

  if (allPoints.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          {emptyLabel}
        </ThemedText>
      </View>
    );
  }

  const { min, max } = axisRange(allPoints.map((point) => point.value));
  const span = max - min;
  const extent = timeExtent(allPoints);
  const withYear = axisNeedsYear(allPoints);

  const x = (iso: string) => timeScale(iso, extent, PAD_LEFT, PLOT_WIDTH);
  const y = (value: number) => PAD_TOP + PLOT_HEIGHT - ((value - min) / span) * PLOT_HEIGHT;

  const gridValues = Array.from(
    { length: GRID_LINES + 1 },
    (_, index) => min + (span * index) / GRID_LINES,
  );

  // Three labels off the TIME range, not off three array positions — the
  // middle tick is the midpoint of the period, which is the whole point.
  const dateTicks =
    extent.maxMs === extent.minMs
      ? [extent.minMs]
      : [extent.minMs, (extent.minMs + extent.maxMs) / 2, extent.maxMs];

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

        {lines.map((line) => {
          const coords = line.points.map((point) => ({
            x: x(point.startedAt),
            y: y(point.value),
          }));
          const path = coords.map((c) => `${c.x},${c.y}`).join(' ');
          // The area fill only makes sense under a single line; under two it
          // is two translucent washes that say nothing about either.
          const area =
            lines.length === 1
              ? `${coords[0]!.x},${PAD_TOP + PLOT_HEIGHT} ${path} ${coords.at(-1)!.x},${PAD_TOP + PLOT_HEIGHT}`
              : null;
          return (
            <React.Fragment key={line.key}>
              {area ? <Polygon points={area} fill={line.color} opacity={0.15} /> : null}
              <Polyline points={path} fill="none" stroke={line.color} strokeWidth={2} />
              {/* Past a few dozen points the markers merge into a band, so a
                  dense line is drawn as a line. */}
              {line.points.length <= MAX_DOTS
                ? coords.map((c, index) => (
                    <Circle
                      key={line.points[index]!.key}
                      cx={c.x}
                      cy={c.y}
                      r={2.5}
                      fill={line.color}
                    />
                  ))
                : null}
            </React.Fragment>
          );
        })}

        <Line
          x1={PAD_LEFT}
          y1={PAD_TOP + PLOT_HEIGHT}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={PAD_TOP + PLOT_HEIGHT}
          stroke={theme.border}
          strokeWidth={1}
        />
        {dateTicks.map((ms, tick) => (
          <SvgText
            key={`date-${ms}`}
            x={timeScale(new Date(ms).toISOString(), extent, PAD_LEFT, PLOT_WIDTH)}
            y={VIEW_HEIGHT - 8}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor={tick === 0 ? 'start' : tick === dateTicks.length - 1 ? 'end' : 'middle'}
          >
            {formatDate(new Date(ms).toISOString(), withYear)}
          </SvgText>
        ))}
      </Svg>

      {/* Always present for two or more lines: the palette's light-mode
          contrast relief is exactly this — the name in text ink beside a
          colour, so identity is never carried by colour alone. */}
      {lines.length > 1 ? (
        <View style={styles.legend} testID="time-series-legend">
          {lines.map((line) => (
            <View key={line.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: line.color }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {line.label}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {omittedLabel ? (
        <ThemedText type="small" themeColor="textSecondary" testID="time-series-omitted">
          {omittedLabel}
        </ThemedText>
      ) : null}
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
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
