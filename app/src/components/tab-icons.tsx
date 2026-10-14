// Tab bar glyphs. `@expo/vector-icons` is not actually in this project's
// dependency tree (checked: absent from pnpm-lock.yaml and node_modules,
// despite being commonly bundled with Expo) — adding it needs the
// maintainer's OK per CLAUDE.md's no-new-deps rule, so these are drawn with
// `react-native-svg`, already a dependency (see target-face.tsx).
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface TabIconProps {
  color: ColorValue;
  size?: number;
}

const DEFAULT_SIZE = 24;

// The app mark's rings: Home is the app's own front page.
export function HomeTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={1.5} fill={color} />
    </Svg>
  );
}

export function StatsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={13} width={4} height={7} rx={1} stroke={color} strokeWidth={2} />
      <Rect x={10} y={9} width={4} height={11} rx={1} stroke={color} strokeWidth={2} />
      <Rect x={16} y={4} width={4} height={16} rx={1} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Pistol silhouette in the profile of a long-slide competition pistol
// (CZ Tactical Sport 2 style): full-length dust cover, beavertail, flared
// magwell. Original line art, not traced from a photo; no maker's marks.
export function FirearmsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.6 5H22v5.6H9.8l-1.7 7.6.9 2.2H2.4l1-2.2 1.8-6.6L2 10.2l.6-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M13.8 10.6V14q0 1.2-1.2 1.2H8.9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Eight-tooth cog, the platform-standard settings glyph.
export function SettingsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 5.62L10.44 3.14L13.56 3.14L13.71 5.62A6.6 6.6 0 0 1 15.3 6.28L17.16 4.63L19.37 6.84L17.72 8.7A6.6 6.6 0 0 1 18.38 10.29L20.86 10.44L20.86 13.56L18.38 13.71A6.6 6.6 0 0 1 17.72 15.3L19.37 17.16L17.16 19.37L15.3 17.72A6.6 6.6 0 0 1 13.71 18.38L13.56 20.86L10.44 20.86L10.29 18.38A6.6 6.6 0 0 1 8.7 17.72L6.84 19.37L4.63 17.16L6.28 15.3A6.6 6.6 0 0 1 5.62 13.71L3.14 13.56L3.14 10.44L5.62 10.29A6.6 6.6 0 0 1 6.28 8.7L4.63 6.84L6.84 4.63L8.7 6.28A6.6 6.6 0 0 1 10.29 5.62Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={2.8} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Open-end wrench: the Tools tab is a hub of utilities (timers, photos,
// Webshooter), so a tool glyph rather than another target/gear.
export function ToolsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.55 17.9L11.66 9.8A4.6 4.6 0 0 1 17.74 3.85L15.36 6.24A1.7 1.7 0 0 0 17.76 8.64L20.15 6.26A4.6 4.6 0 0 1 14.2 12.34L6.1 20.45Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
