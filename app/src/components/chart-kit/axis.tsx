// Chart kit, the drawing half (#822): gridlines and tick labels for a value
// axis, and the caption under a chart. Plain react-native-svg like the
// existing charts; labels go through SvgText so the web draws the sans font,
// at the `caption` size, in `textSecondary`.
import { G, Line } from 'react-native-svg';

import { type LinearAxis, type ChartColors, formatTick } from '@/components/chart-kit/chart-kit';
import { SvgText } from '@/components/svg-text';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { TabularNums, Typography } from '@/theme/tokens';

export interface YAxisGridProps {
  axis: LinearAxis;
  colors: ChartColors;
  /** The plot's left edge; labels sit right-aligned just left of it. */
  left: number;
  /** The plot's right edge. */
  right: number;
  /** The plot's top edge; `axis.scale` is measured from here. */
  top: number;
  locale: string;
}

/** Horizontal gridlines at every nice tick, labelled at the left. */
export function YAxisGrid({ axis, colors, left, right, top, locale }: YAxisGridProps) {
  return (
    <G>
      {axis.ticks.map((tick) => {
        const y = top + axis.scale(tick);
        return (
          <G key={tick}>
            <Line
              x1={left}
              x2={right}
              y1={y}
              y2={y}
              stroke={colors.grid}
              strokeWidth={1}
              strokeDasharray={tick === axis.min ? undefined : '2 4'}
            />
            <SvgText
              x={left - 6}
              y={y + Typography.caption.fontSize / 3}
              fontSize={Typography.caption.fontSize}
              fill={colors.tick}
              textAnchor="end"
            >
              {formatTick(tick, axis.decimals, locale)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

/** The footnote under a chart ("Last 30 sessions"): caption type, secondary text. */
export function ChartCaption({ style, ...rest }: Omit<ThemedTextProps, 'type' | 'themeColor'>) {
  return (
    <ThemedText type="caption" themeColor="textSecondary" style={[TabularNums, style]} {...rest} />
  );
}
