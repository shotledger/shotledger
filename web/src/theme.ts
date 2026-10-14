// The design tokens (shared/src/design-tokens, the app's own) as CSS custom
// properties: the colours, one set per scheme, plus the chart colours and the
// spacing and radius scales. Nothing here restates a value.
import {
  Colors,
  DataViz,
  Radius,
  Spacing,
  type ThemeName,
} from '@shotledger/shared/src/design-tokens';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every custom property one scheme sets, name (with `--`) to value. */
export function themeProperties(scheme: ThemeName): [string, string][] {
  const viz = DataViz[scheme];
  return [
    ...Object.entries(Colors[scheme]).map(([key, value]): [string, string] => [
      `--${kebab(key)}`,
      value,
    ]),
    ...viz.categorical.map((value, i): [string, string] => [
      `--data-viz-categorical-${i + 1}`,
      value,
    ]),
    ...viz.rings.map((value, i): [string, string] => [`--data-viz-rings-${i + 1}`, value]),
    ...Object.entries(Spacing).map(([key, value]): [string, string] => [
      `--space-${key}`,
      `${value}px`,
    ]),
    ...Object.entries(Radius).map(([key, value]): [string, string] => [
      `--radius-${key}`,
      `${value}px`,
    ]),
  ];
}

function declarations(scheme: ThemeName): string {
  return themeProperties(scheme)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

/**
 * The CSP (web/public/_headers, no 'unsafe-inline') blocks a <style>
 * element, so this goes through the CSSOM: a constructed sheet where the
 * browser has `adoptedStyleSheets`, else the properties on <html> itself,
 * swapped when the colour scheme changes.
 */
export function installTheme(doc: Document = document, win: Window = window): void {
  if ('adoptedStyleSheets' in doc && typeof CSSStyleSheet !== 'undefined') {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`:root { ${declarations('light')} }
@media (prefers-color-scheme: dark) { :root { ${declarations('dark')} } }`);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return;
  }
  const dark = win.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    for (const [name, value] of themeProperties(dark.matches ? 'dark' : 'light')) {
      doc.documentElement.style.setProperty(name, value);
    }
  };
  apply();
  dark.addEventListener('change', apply);
}
