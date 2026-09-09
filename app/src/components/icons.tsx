// Authored SVG icons outside the tab bar, drawn with `react-native-svg` for
// the same reason tab-icons.tsx gives: `@expo/vector-icons` is not in this
// project's dependency tree and adding it needs the maintainer's OK.
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export interface IconProps {
  color: ColorValue;
  size?: number;
}

const DEFAULT_SIZE = 24;

export function CheckIcon({ color, size = DEFAULT_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m5 12.5 4.5 4.5L19 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// The "i" is drawn, not typed: a Unicode glyph would inherit the text font
// and drift in weight and baseline against the other icons here.
export function InfoIcon({ color, size = DEFAULT_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={7.6} r={1.3} fill={color} />
      <Path d="M12 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Material's overflow affordance: three filled dots, vertically stacked. */
export function OverflowIcon({ color, size = DEFAULT_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.75} fill={color} />
      <Circle cx={12} cy={12} r={1.75} fill={color} />
      <Circle cx={12} cy={19} r={1.75} fill={color} />
    </Svg>
  );
}
