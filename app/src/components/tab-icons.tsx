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

export function SettingsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.5 6.5l-1.55 1.55M8.05 15.95 6.5 17.5M17.5 17.5l-1.55-1.55M8.05 8.05 6.5 6.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Wrench — the Tools tab is a hub of utilities (timers, photos, Webshooter),
// so a tool glyph rather than another target/gear.
export function ToolsTabIcon({ color, size = DEFAULT_SIZE }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20.5 7.5A4 4 0 1 1 16.5 3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M14.2 9.8 5.6 18.4" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
