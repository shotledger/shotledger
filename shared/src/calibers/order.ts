import { canonicalCaliber, isCaliberPreset } from './normalize';
import { CALIBER_PRESET_NAMES } from './presets';

/** How often one stored caliber string occurs, as the query layer counts it. */
export interface CaliberUsageCount {
  /** The value exactly as it sits in `firearms.caliber` / `ammo_lots.caliber`. */
  readonly caliber: string | null;
  readonly count: number;
}

export interface OrderedCaliber {
  /** Canonical name, or the legacy string for a value the presets don't cover. */
  readonly name: string;
  /** Total occurrences across the rows the caller counted; 0 for an unused preset. */
  readonly count: number;
  /** false for a legacy value that survived the presets-only migration. */
  readonly isPreset: boolean;
}

/**
 * The picker's option order: what this shooter actually owns first, most-used
 * down to least, then the rest of the vocabulary in its curated order.
 *
 * Spelling variants collapse before counting — two rows saying `9mm Luger`
 * and `9X19MM` are two uses of `9×19 mm`, not one use each of two calibers.
 * A stored value no preset covers is kept and ranked with the rest rather
 * than dropped, so a legacy row stays visible and selectable.
 */
export function orderCalibersByUsage(
  usage: readonly CaliberUsageCount[],
  presets: readonly string[] = CALIBER_PRESET_NAMES,
): OrderedCaliber[] {
  const presetIndex = new Map(presets.map((name, index) => [name, index]));

  const totals = new Map<string, number>();
  for (const row of usage) {
    if (row.count <= 0) continue;
    const raw = row.caliber?.trim();
    if (!raw) continue;
    const name = canonicalCaliber(raw) ?? raw;
    totals.set(name, (totals.get(name) ?? 0) + row.count);
  }

  const used = [...totals].map(([name, count]) => ({
    name,
    count,
    isPreset: isCaliberPreset(name),
  }));
  used.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    // Ties keep the curated order; a legacy value sorts after every preset,
    // then by name, so the list never depends on row iteration order.
    const ai = presetIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bi = presetIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const rest = presets
    .filter((name) => !totals.has(name))
    .map((name) => ({ name, count: 0, isPreset: true }));

  return [...used, ...rest];
}
