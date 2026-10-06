// The app's colour tokens as CSS custom properties, one set per scheme.
import { Colors } from '../../app/src/theme/colors';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(palette: Record<string, string>): string {
  return Object.entries(palette)
    .map(([key, value]) => `--${kebab(key)}: ${value};`)
    .join(' ');
}

export function installTheme(): void {
  const style = document.createElement('style');
  style.textContent = `:root { ${declarations(Colors.light)} }
@media (prefers-color-scheme: dark) { :root { ${declarations(Colors.dark)} } }`;
  document.head.append(style);
}
