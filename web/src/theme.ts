// The app's colour tokens as CSS custom properties, one set per scheme.
import { Colors } from '../../app/src/theme/colors';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(palette: Record<string, string>): string {
  return Object.entries(palette)
    .map(([key, value]) => `--${kebab(key)}: ${value};`)
    .join(' ');
}

// A constructed sheet rather than a <style> element, which the CSP
// (web/public/_headers, no 'unsafe-inline') would block.
export function installTheme(): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`:root { ${declarations(Colors.light)} }
@media (prefers-color-scheme: dark) { :root { ${declarations(Colors.dark)} } }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
