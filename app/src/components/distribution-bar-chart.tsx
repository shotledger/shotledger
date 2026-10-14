// M5: shot-value distribution, plain react-native-svg (see trend-line-chart.tsx
// for the chart-library deviation rationale).
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { SvgText } from '@/components/svg-text';

import { useTheme } from '@/hooks/use-theme';
import type { DistributionBucket } from '@/features/stats/use-stats-data';

export interface DistributionBarChartProps extends ViewProps {
  buckets: readonly DistributionBucket[];
  height?: number;
}

const DEFAULT_HEIGHT = 140;
const PADDING = 12;
const LABEL_HEIGHT = 16;

export function DistributionBarChart({
  buckets,
  height = DEFAULT_HEIGHT,
  style,
  ...rest
}: DistributionBarChartProps) {
  const theme = useTheme();
  const width = Math.max(buckets.length * 32, 200);

  if (buckets.length === 0) {
    return null;
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));
  const barAreaHeight = height - PADDING * 2 - LABEL_HEIGHT;
  const barWidth = (width - PADDING * 2) / buckets.length;

  return (
    <View style={[styles.container, style]} {...rest} testID="distribution-chart">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {buckets.map((bucket, index) => {
          const barHeight = maxCount === 0 ? 0 : (bucket.count / maxCount) * barAreaHeight;
          const x = PADDING + index * barWidth;
          const y = PADDING + barAreaHeight - barHeight;
          return (
            <Rect
              key={bucket.value}
              x={x + 2}
              y={y}
              width={Math.max(barWidth - 4, 1)}
              height={barHeight}
              fill={theme.primary}
              rx={2}
            />
          );
        })}
        {buckets.map((bucket, index) => (
          <SvgText
            key={`label-${bucket.value}`}
            x={PADDING + index * barWidth + barWidth / 2}
            y={height - 2}
            fontSize={11}
            fill={theme.textSecondary}
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
    alignItems: 'center',
  },
});
