// A plain x/y scatter: one dot per point, both axes ranged to the data.
// Used by the report's Sighter and Result card (#573).
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 220;
const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 34;
const PLOT_WIDTH = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

export interface ScatterPoint {
  key: string;
  x: number;
  y: number;
}

export interface ScatterPlotProps extends ViewProps {
  points: readonly ScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatValue: (value: number) => string;
}

/** The data's range with a little room, never zero-wide. */
function range(values: readonly number[]): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi === lo ? 1 : (hi - lo) * 0.1;
  return { min: lo - pad, max: hi + pad };
}

export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  formatValue,
  style,
  ...rest
}: ScatterPlotProps) {
  const theme = useTheme();
  const xr = range(points.map((p) => p.x));
  const yr = range(points.map((p) => p.y));
  const sx = (v: number) => PAD_LEFT + ((v - xr.min) / (xr.max - xr.min)) * PLOT_WIDTH;
  const sy = (v: number) =>
    PAD_TOP + PLOT_HEIGHT - ((v - yr.min) / (yr.max - yr.min)) * PLOT_HEIGHT;
  const bottom = PAD_TOP + PLOT_HEIGHT;

  return (
    <View style={[styles.container, style]} {...rest}>
      <Svg width="100%" height={VIEW_HEIGHT} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
        <Line
          x1={PAD_LEFT}
          y1={bottom}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={bottom}
          stroke={theme.border}
        />
        <Line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={bottom} stroke={theme.border} />
        {[yr.min, yr.max].map((v, i) => (
          <SvgText
            key={`y-${i}`}
            x={PAD_LEFT - 4}
            y={sy(v) + (i === 0 ? 0 : 8)}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor="end"
          >
            {formatValue(v)}
          </SvgText>
        ))}
        {[xr.min, xr.max].map((v, i) => (
          <SvgText
            key={`x-${i}`}
            x={sx(v)}
            y={bottom + 12}
            fontSize={9}
            fill={theme.textSecondary}
            textAnchor={i === 0 ? 'start' : 'end'}
          >
            {formatValue(v)}
          </SvgText>
        ))}
        <SvgText
          x={PAD_LEFT + PLOT_WIDTH / 2}
          y={VIEW_HEIGHT - 6}
          fontSize={10}
          fill={theme.textSecondary}
          textAnchor="middle"
        >
          {xLabel}
        </SvgText>
        <SvgText
          x={12}
          y={PAD_TOP + PLOT_HEIGHT / 2}
          fontSize={10}
          fill={theme.textSecondary}
          textAnchor="middle"
          rotation={-90}
          origin={`12, ${PAD_TOP + PLOT_HEIGHT / 2}`}
        >
          {yLabel}
        </SvgText>
        {points.map((p) => (
          <Circle
            key={p.key}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={3.5}
            fill={theme.primary}
            opacity={0.8}
          />
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
