import { afterEach, describe, expect, it, vi } from 'vitest';

import { Colors } from '../../app/src/theme/colors';
import { installTheme } from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeWindow(darkInitially: boolean) {
  const query = {
    matches: darkInitially,
    listener: undefined as (() => void) | undefined,
    addEventListener: (_type: string, listener: () => void) => {
      query.listener = listener;
    },
  };
  return { query, win: { matchMedia: () => query } as unknown as Window };
}

describe('installTheme', () => {
  it('adopts a constructed sheet with both schemes where the browser supports it', () => {
    const texts: string[] = [];
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        replaceSync(text: string) {
          texts.push(text);
        }
      },
    );
    const doc = { adoptedStyleSheets: [] as unknown[] } as unknown as Document;

    installTheme(doc, fakeWindow(false).win);

    expect(doc.adoptedStyleSheets).toHaveLength(1);
    expect(texts[0]).toContain(`--background: ${Colors.light.background};`);
    expect(texts[0]).toContain('@media (prefers-color-scheme: dark)');
    expect(texts[0]).toContain(`--background: ${Colors.dark.background};`);
  });

  it('falls back to properties on <html>, following the colour scheme, without adoptedStyleSheets', () => {
    const properties = new Map<string, string>();
    const doc = {
      documentElement: {
        style: { setProperty: (name: string, value: string) => properties.set(name, value) },
      },
    } as unknown as Document;
    const { query, win } = fakeWindow(false);

    installTheme(doc, win);
    expect(properties.get('--background')).toBe(Colors.light.background);

    query.matches = true;
    query.listener?.();
    expect(properties.get('--background')).toBe(Colors.dark.background);
  });
});
