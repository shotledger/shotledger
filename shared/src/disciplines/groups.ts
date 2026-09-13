// Vapengrupper (the GUN) — federation-scoped ids, `<federation>:<code>`,
// because A/B/C/R/M are an SPSF concept other federations don't share (§6.4a).
// Sources: SHB 2026 F.4 pp. 169-172 (precision), D.4.4 p. 86 / J.4 (R),
// G.4.1 pp. 196-197 (magnum M1-M9).

export interface WeaponGroup {
  /** Federation-scoped id, e.g. 'spsf:C'. */
  id: string;
  /** Id slug, e.g. 'C' — the suffix of `id`. Not for display. */
  code: string;
  /** Display label, e.g. 'A Opt'. Same as `code` for every group but one. */
  label: string;
  federation: string;
}

function spsf(code: string, label = code): WeaponGroup {
  return { id: `spsf:${code}`, code, label, federation: 'SPSF' };
}

const MAGNUM_CODES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'];

export const SPSF_WEAPON_GROUPS: readonly WeaponGroup[] = [
  // A and its sub-groups (F.4.1), A with optics (F.4.5), B, C
  spsf('A'),
  spsf('AM'),
  spsf('AP'),
  spsf('AG'),
  // The id slug stays 'A-opt' so stored sessions keep resolving; only the
  // label reads 'A Opt'.
  spsf('A-opt', 'A Opt'),
  spsf('B'),
  spsf('C'),
  // grovkalibrig revolver — fält and milsnabb only, never precision (F.4.4)
  spsf('R'),
  ...MAGNUM_CODES.map((code) => spsf(code)),
];

export const GENERIC_WEAPON_GROUPS: readonly WeaponGroup[] = [
  { id: 'generic:airgun', code: 'airgun', label: 'airgun', federation: 'generic' },
];

const ALL_WEAPON_GROUPS: readonly WeaponGroup[] = [...SPSF_WEAPON_GROUPS, ...GENERIC_WEAPON_GROUPS];

export function findWeaponGroup(id?: string | null): WeaponGroup | null {
  if (!id) return null;
  return ALL_WEAPON_GROUPS.find((group) => group.id === id) ?? null;
}

/** Display label for a group id; '' when the id is unknown or absent. */
export function weaponGroupLabel(id?: string | null): string {
  return findWeaponGroup(id)?.label ?? '';
}
