// Hand-drawn time-series chart for Statistics (x = session date). Plain
// react-native-svg, like group-plot.tsx / distribution-bar-chart.tsx — no
// charting library (victory-native and @shopify/react-native-skia are not in
// the lockfile). The axis, colours and type come from the chart kit (#822):
// nice ticks, `border` gridlines, Caption-sized labels in `textSecondary`.
//
// Responsive by viewBox: width="100%" with a fixed coordinate space, so the
// same chart fits any screen without measuring.
//
// Takes LINES, not one series: a precision session (max 350) and a milsnabb
// session (max 600) on one axis make a saw-tooth that means nothing, so each
// discipline gets its own (#349). The geometry lives in
// time-series-chart-math.ts so it can be tested without rendering.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { ChartCaption, YAxisGrid } from '@/components/chart-kit/axis';
import { chartColors, linearAxis } from '@/components/chart-kit/chart-kit';
import { SvgText } from '@/components/svg-text';
import { ThemedText } from '@/components/themed-text';
import { useResolvedThemeName } from '@/hooks/use-theme';
import { Radius, Spacing, Typography } from '@/theme/tokens';
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
  /** Values in the unit the axis shows (points, not tenths): ticks print as they are. */
  lines: readonly TimeSeriesLine[];
  /** Formats an x-axis date label. `withYear` when the range crosses one. */
  formatDate: (iso: string, withYear: boolean) => string;
  emptyLabel: string;
  /** Rendered under the legend when the palette could not cover everything. */
  omittedLabel?: string | null;
}

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 180;
const PAD_LEFT = 40;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;

const PLOT_WIDTH = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

export function TimeSeriesChart({
  lines,
  formatDate,
  emptyLabel,
  omittedLabel,
  style,
  ...rest
}: TimeSeriesChartProps) {
  const { i18n } = useTranslation();
  const colors = chartColors(useResolvedThemeName());
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

  const values = allPoints.map((point) => point.value);
  // A line's axis need not start at zero (a series mean lives between 35 and
  // 50); the nice ticks round it out to whole steps around the data.
  const axis = linearAxis(Math.min(...values), Math.max(...values), PLOT_HEIGHT, {
    invert: true,
  });
  const extent = timeExtent(allPoints);
  const withYear = axisNeedsYear(allPoints);

  const x = (iso: string) => timeScale(iso, extent, PAD_LEFT, PLOT_WIDTH);
  const y = (value: number) => PAD_TOP + axis.scale(value);
  const bottom = PAD_TOP + PLOT_HEIGHT;

  // Three labels off the TIME range, not off three array positions — the
  // middle tick is the midpoint of the period, which is the whole point.
  const dateTicks =
    extent.maxMs === extent.minMs
      ? [extent.minMs]
      : [extent.minMs, (extent.minMs + extent.maxMs) / 2, extent.maxMs];

  return (
    <View testID="time-series-chart" style={[styles.container, style]} {...rest}>
      <Svg width="100%" height={VIEW_HEIGHT} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
        <YAxisGrid
          axis={axis}
          colors={colors}
          left={PAD_LEFT}
          right={VIEW_WIDTH - PAD_RIGHT}
          top={PAD_TOP}
          locale={i18n.language}
        />

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
              ? `${coords[0]!.x},${bottom} ${path} ${coords.at(-1)!.x},${bottom}`
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

        {dateTicks.map((ms, tick) => (
          <SvgText
            key={`date-${ms}`}
            x={timeScale(new Date(ms).toISOString(), extent, PAD_LEFT, PLOT_WIDTH)}
            y={VIEW_HEIGHT - 6}
            fontSize={Typography.caption.fontSize}
            fill={colors.tick}
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
              <ThemedText type="caption" themeColor="textSecondary">
                {line.label}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {omittedLabel ? (
        <ChartCaption testID="time-series-omitted">{omittedLabel}</ChartCaption>
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
    gap: Spacing.one,
  },
  swatch: {
    width: Spacing.two,
    height: Spacing.two,
    borderRadius: Radius.pill,
  },
});
