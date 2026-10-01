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

/**
 * A photo: frame, horizon and sun. Marks a series that carries a target
 * photo, and taps through to it — it replaced a "Photo attached" text chip,
 * which cost a chip's width to say what an icon says at a glance, and did not
 * look like something you could open (maintainer, on device 2026-09-11).
 */
export function PhotoIcon({ color, size = DEFAULT_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={8.5} cy={9.5} r={1.5} fill={color} />
      <Path
        d="m3.5 16.5 4.5-4 4 3.5 3.5-3 5 4.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A bin with a lid: the delete affordance on swiped list rows (#456). */
export function TrashIcon({ color, size = DEFAULT_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M10 11v5M14 11v5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
