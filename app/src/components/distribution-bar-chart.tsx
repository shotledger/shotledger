// Shot-value distribution: one bar per ring value, plain react-native-svg
// (see trend-line-chart.tsx for the chart-library deviation rationale). On
// the chart kit (#822): the count axis starts at zero and rounds up to nice
// ticks, bars take the first data-viz slot (never the accent), labels are
// Caption-sized in `textSecondary`.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { YAxisGrid } from '@/components/chart-kit/axis';
import { chartColors, linearAxis, seriesColor } from '@/components/chart-kit/chart-kit';
import { SvgText } from '@/components/svg-text';
import { useResolvedThemeName } from '@/hooks/use-theme';
import type { DistributionBucket } from '@/features/stats/use-stats-data';
import { Typography } from '@/theme/tokens';

export interface DistributionBarChartProps extends ViewProps {
  buckets: readonly DistributionBucket[];
  height?: number;
}

const DEFAULT_HEIGHT = 140;
const VIEW_WIDTH = 320;
const PAD_LEFT = 32;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const LABEL_HEIGHT = 20;

export function DistributionBarChart({
  buckets,
  height = DEFAULT_HEIGHT,
  style,
  ...rest
}: DistributionBarChartProps) {
  const { i18n } = useTranslation();
  const colors = chartColors(useResolvedThemeName());

  if (buckets.length === 0) {
    return null;
  }

  const plotHeight = height - PAD_TOP - LABEL_HEIGHT;
  // A bar's length is its count, so the axis starts at zero, always.
  const axis = linearAxis(0, Math.max(1, ...buckets.map((b) => b.count)), plotHeight, {
    maxTicks: 4,
    invert: true,
  });
  const plotWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const slot = plotWidth / buckets.length;
  const barWidth = Math.min(slot * 0.7, 40);
  const fill = seriesColor(colors, 0) ?? colors.value;
  const baseline = PAD_TOP + plotHeight;

  return (
    <View style={[styles.container, style]} {...rest} testID="distribution-chart">
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
        <YAxisGrid
          axis={axis}
          colors={colors}
          left={PAD_LEFT}
          right={VIEW_WIDTH - PAD_RIGHT}
          top={PAD_TOP}
          locale={i18n.language}
        />
        {buckets.map((bucket, index) => {
          const top = PAD_TOP + axis.scale(bucket.count);
          const center = PAD_LEFT + index * slot + slot / 2;
          return (
            <Rect
              key={bucket.value}
              x={center - barWidth / 2}
              y={top}
              width={barWidth}
              height={Math.max(0, baseline - top)}
              fill={fill}
              rx={2}
            />
          );
        })}
        {buckets.map((bucket, index) => (
          <SvgText
            key={`label-${bucket.value}`}
            x={PAD_LEFT + index * slot + slot / 2}
            y={height - 4}
            fontSize={Typography.caption.fontSize}
            fill={colors.tick}
            textAnchor="middle"
          >
            {bucket.value}
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
});
