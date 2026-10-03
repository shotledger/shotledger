// The hole-punch stamp on a perfect series' row (#482): a small target with
// every hole in the middle. Stamps in once when `animate` is set.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const SIZE = 28;
const C = SIZE / 2;

// Hole offsets from the center, in px: a tight group in the 10, tighter for
// an all-inner-ten series.
const HOLES = [
  [0, 0],
  [-2.6, -1.8],
  [2.4, -2.2],
  [-1.8, 2.6],
  [2.8, 2],
] as const;

export interface PerfectSeriesStampProps {
  innerTens: boolean;
  animate?: boolean;
  testID?: string;
}

export function PerfectSeriesStamp({
  innerTens,
  animate = false,
  testID,
}: PerfectSeriesStampProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const playing = animate && !reduceMotion;
  const progress = useSharedValue(playing ? 0 : 1);

  useEffect(() => {
    if (!playing) return;
    progress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.6)) });
  }, [playing, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2),
    transform: [
      { scale: 2.4 - progress.value * 1.4 },
      { rotate: `${(1 - progress.value) * -25}deg` },
    ],
  }));

  const spread = innerTens ? 0.55 : 1;
  return (
    <Animated.View
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(innerTens ? 'session.perfectInnerStamp' : 'session.perfectStamp')}
      testID={testID}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={C} cy={C} r={C - 1.5} stroke={theme.celebration} strokeWidth={2} fill="none" />
        <Circle cx={C} cy={C} r={C - 7} stroke={theme.celebration} strokeWidth={1.5} fill="none" />
        <Circle cx={C} cy={C} r={6} fill={theme.celebration} fillOpacity={innerTens ? 0.45 : 0.2} />
        {HOLES.map(([dx, dy], index) => (
          <Circle
            key={index}
            cx={C + dx * spread}
            cy={C + dy * spread}
            r={1.5}
            fill={theme.background}
            stroke={theme.celebration}
            strokeWidth={0.75}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}
