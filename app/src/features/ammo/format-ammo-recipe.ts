// Pure builder for the ammo row's recipe line (maintainer, 2026-09-10: "the
// hand loading info should be on a separate line and remove the slash").
// Kept free of any DB import so it can be jest-unit-tested.

/** The `ammo_lots` columns the recipe line is derived from. */
export interface AmmoRecipeFields {
  bulletMake?: string | null;
  bulletModel?: string | null;
  bulletWeightGr?: number | null;
  powder?: string | null;
  powderChargeGr?: number | null;
}

/** Separates projectile from powder — the same glyph the Home rows join on. */
export const RECIPE_SEPARATOR = ' · ';

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The lot's load as one line — projectile, then powder — or `null` when the
 * lot carries neither (a factory lot with no projectile data recorded). Every
 * part is optional and only what is set is joined, so a half-filled lot never
 * renders a dangling separator or an empty line.
 *
 * `formatGrains` comes from the caller so the unit stays in i18n.
 */
export function formatAmmoRecipe(
  lot: AmmoRecipeFields,
  formatGrains: (value: number) => string,
): string | null {
  const bullet = [
    present(lot.bulletMake),
    present(lot.bulletModel),
    lot.bulletWeightGr != null ? formatGrains(lot.bulletWeightGr) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  const powder = [
    present(lot.powder),
    lot.powderChargeGr != null ? formatGrains(lot.powderChargeGr) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  const line = [bullet, powder].filter((part) => part.length > 0).join(RECIPE_SEPARATOR);
  return line.length > 0 ? line : null;
}
