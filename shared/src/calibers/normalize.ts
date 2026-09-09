import { CALIBER_PRESETS } from './presets';

/**
 * Folds a caliber spelling to a comparison key: case, spacing, `×` vs `x`,
 * a decimal comma, and the leading dot of an imperial designation all stop
 * mattering, so `.22 LR`, `22 lr` and `.22LR` are one key.
 *
 * Internal dots are kept: without them `4,5 mm` and `.45` would collide.
 */
export function caliberKey(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[×x]/g, 'x')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/^\.+/, '');
}

/**
 * Keys a preset name answers to on its own: the name, plus — for a metric
 * `<bore>×<case> mm` designation only — the same name without the `mm`, so
 * `9x19` finds `9×19 mm`. Bore-only air names are left alone deliberately:
 * dropping `mm` there would make `4.5 mm` collide with `.45`.
 */
function nameKeys(name: string): string[] {
  const keys = [caliberKey(name)];
  if (name.includes('×')) {
    const withoutMm = name.replace(/\s+mm\b/, '');
    if (withoutMm !== name) keys.push(caliberKey(withoutMm));
  }
  return keys;
}

const byKey = new Map<string, string>();
for (const preset of CALIBER_PRESETS) {
  for (const key of [...nameKeys(preset.name), ...(preset.aliases ?? [])]) {
    if (!byKey.has(key)) byKey.set(key, preset.name);
  }
}

/** Every key that resolves to a preset — the migration's mapping table. */
export const CALIBER_KEY_TO_NAME: ReadonlyMap<string, string> = byKey;

const presetNames = new Set(CALIBER_PRESETS.map((preset) => preset.name));

export function isCaliberPreset(name: string): boolean {
  return presetNames.has(name);
}

/**
 * The canonical preset a stored or scanned caliber string means, or `null`
 * when nothing in the vocabulary matches it.
 *
 * Deliberately unmapped because they are genuinely ambiguous, not because
 * they are unknown: bare `.22` (.22 LR, a 5.5 mm air rifle, or a .22
 * centrefire), `.45` (.45 ACP, .45 Colt, or 4.5 mm air), `.38`, `.32`, `.30`
 * and bare `7.62`. Guessing one of those would rewrite a user's row into
 * something they did not say.
 */
export function canonicalCaliber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = caliberKey(raw);
  if (!key) return null;
  return byKey.get(key) ?? null;
}
