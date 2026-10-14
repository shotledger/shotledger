import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { breaksInsideWord, nextFitScale } from '@/components/fit-text-math';

export interface FitTextProps extends Omit<ThemedTextProps, 'children' | 'numberOfLines'> {
  children: string;
  /**
   * `false`: one line, shrunk to fit (the platform's `adjustsFontSizeToFit`).
   * `true`: wraps between words; shrinks only while a single word is wider
   * than the line, so the text neither truncates nor splits mid-word (#823).
   */
  wrap: boolean;
  /** The smallest the font may get, as a fraction of `style`'s `fontSize`. */
  minimumFontScale: number;
}

/**
 * Text in a fixed-width slot that must never truncate. `style` must carry the
 * `fontSize` and `lineHeight` to scale from. The web has its own copy
 * (`fit-text.web.tsx`): React Native Web has neither `adjustsFontSizeToFit`
 * nor `onTextLayout`.
 */
export function FitText({ children, wrap, minimumFontScale, style, ...rest }: FitTextProps) {
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState({ key: '', scale: 1 });

  if (!wrap) {
    return (
      <ThemedText
        style={style}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
        {...rest}
      >
        {children}
      </ThemedText>
    );
  }

  // A new width or a new string starts again from full size.
  const key = `${width}|${children}`;
  const scale = fit.key === key ? fit.scale : 1;
  const { fontSize = 14, lineHeight = 20 } = StyleSheet.flatten(style) ?? {};

  return (
    <ThemedText
      style={[style, { fontSize: fontSize * scale, lineHeight: lineHeight * scale }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      onTextLayout={(e) => {
        const lines = e.nativeEvent.lines.map((line) => line.text);
        if (scale > minimumFontScale && breaksInsideWord(children, lines)) {
          setFit({ key, scale: nextFitScale(scale, minimumFontScale) });
        }
      }}
      {...rest}
    >
      {children}
    </ThemedText>
  );
}
