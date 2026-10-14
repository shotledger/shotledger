// SVG text in the app's sans font. react-native-svg's <Text> sets no font
// of its own, so on web it fell back to the browser's default serif (#823);
// on Android and iOS it already drew the system font, which `Fonts.sans`
// names. Every chart, the target face and the share card import this, not
// `Text` from react-native-svg.
import type { ComponentProps } from 'react';
import { Text } from 'react-native-svg';

import { Fonts } from '@/theme/tokens';

export type SvgTextProps = ComponentProps<typeof Text>;

/** `Text` from react-native-svg, defaulting `fontFamily` to `Fonts.sans`. */
export function SvgText({ fontFamily = Fonts.sans, ...props }: SvgTextProps) {
  return <Text fontFamily={fontFamily} {...props} />;
}
