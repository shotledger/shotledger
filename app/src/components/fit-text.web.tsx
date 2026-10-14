import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, type Text, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { nextFitScale } from '@/components/fit-text-math';
import type { FitTextProps } from '@/components/fit-text';

/**
 * The web half of `FitText`: React Native Web ellipsizes where the phone
 * would shrink, so this measures the rendered element instead. A word wider
 * than the line, or a single line wider than the slot, puts text outside the
 * element's box; the font steps down until none is, or until
 * `minimumFontScale`. A wrapped label that still has a word too wide at the
 * minimum may then break inside it rather than spill out of the tile.
 */
export function FitText({ children, wrap, minimumFontScale, style, ...rest }: FitTextProps) {
  const ref = useRef<Text>(null);
  const [fit, setFit] = useState({ scale: 1, breakWords: false });
  const { fontSize = 14, lineHeight = 20 } = StyleSheet.flatten(style) ?? {};

  useLayoutEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    let lastWidth = -1;

    // `force`: the glyphs changed under an unchanged box (a web font
    // arrived), which the ResizeObserver does not report.
    const measure = (force = false) => {
      const width = el.clientWidth;
      if (width === lastWidth && !force) return;
      lastWidth = width;

      const apply = (scale: number, breakWords: boolean) => {
        el.style.fontSize = `${fontSize * scale}px`;
        // A single line keeps its box height so values in a row stay level.
        if (wrap) el.style.lineHeight = `${lineHeight * scale}px`;
        el.style.overflowWrap = breakWords ? 'anywhere' : 'normal';
      };
      // Word by word, not `scrollWidth`: that rounds to whole pixels while
      // the browser ellipsizes a line a fraction of one too wide, and a line
      // box counts the space it broke at, which may hang past the edge.
      const overflows = () => {
        const box = el.getBoundingClientRect();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
            range.setStart(node, word.index);
            range.setEnd(node, word.index + word[0].length);
            for (const r of Array.from(range.getClientRects())) {
              if (r.right > box.right + 0.01 || r.left < box.left - 0.01) return true;
            }
          }
        }
        return false;
      };

      let scale = 1;
      apply(scale, false);
      while (overflows() && scale > minimumFontScale) {
        scale = nextFitScale(scale, minimumFontScale);
        apply(scale, false);
      }
      const breakWords = wrap && overflows();
      apply(scale, breakWords);
      setFit((prev) =>
        prev.scale === scale && prev.breakWords === breakWords ? prev : { scale, breakWords },
      );
    };

    measure(true);
    const onFonts = () => measure(true);
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    fonts?.addEventListener('loadingdone', onFonts);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure());
    observer?.observe(el);
    return () => {
      fonts?.removeEventListener('loadingdone', onFonts);
      observer?.disconnect();
    };
  }, [children, wrap, minimumFontScale, fontSize, lineHeight]);

  // Props the DOM understands but React Native's types do not.
  const webOnly = {
    overflowWrap: fit.breakWords ? 'anywhere' : 'normal',
    wordBreak: 'normal',
  } as unknown as TextStyle;

  return (
    <ThemedText
      ref={ref}
      style={[
        style,
        {
          fontSize: fontSize * fit.scale,
          lineHeight: wrap ? lineHeight * fit.scale : lineHeight,
        },
        wrap && webOnly,
      ]}
      numberOfLines={wrap ? undefined : 1}
      {...rest}
    >
      {children}
    </ThemedText>
  );
}
