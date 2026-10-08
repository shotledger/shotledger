// The app's colour tokens as CSS custom properties, one set per scheme.
import { Colors } from '../../app/src/theme/colors';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(palette: Record<string, string>): string {
  return Object.entries(palette)
    .map(([key, value]) => `--${kebab(key)}: ${value};`)
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
    sheet.replaceSync(`:root { ${declarations(Colors.light)} }
@media (prefers-color-scheme: dark) { :root { ${declarations(Colors.dark)} } }`);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return;
  }
  const dark = win.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    for (const [key, value] of Object.entries(dark.matches ? Colors.dark : Colors.light)) {
      doc.documentElement.style.setProperty(`--${kebab(key)}`, value);
    }
  };
  apply();
  dark.addEventListener('change', apply);
}
