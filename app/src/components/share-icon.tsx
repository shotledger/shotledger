// Small share glyph for row-level share actions (Home list, 2026-09-03).
// `react-native-svg` per tab-icons.tsx's precedent — no icon-font dependency.
import type { ColorValue } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

export interface ShareIconProps {
  color: ColorValue;
  size?: number;
}

export function ShareIcon({ color, size = 20 }: ShareIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 15V4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Polyline
        points="8 8 12 4 16 8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
