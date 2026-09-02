// Vapengrupper (the GUN) — federation-scoped ids, `<federation>:<code>`,
// because A/B/C/R/M are an SPSF concept other federations don't share (§6.4a).
// Sources: SHB 2026 F.4 pp. 169-172 (precision), D.4.4 p. 86 / J.4 (R),
// G.4.1 pp. 196-197 (magnum M1-M9).

export interface WeaponGroup {
  /** Federation-scoped id, e.g. 'spsf:C'. */
  id: string;
  /** Display code, e.g. 'C'. */
  code: string;
  federation: string;
}

function spsf(code: string): WeaponGroup {
  return { id: `spsf:${code}`, code, federation: 'SPSF' };
}

const MAGNUM_CODES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'];

export const SPSF_WEAPON_GROUPS: readonly WeaponGroup[] = [
  // A and its sub-groups (F.4.1), A with optics (F.4.5), B, C
  'A',
  'AM',
  'AP',
  'AG',
  'A-opt',
  'B',
  'C',
  // grovkalibrig revolver — fält and milsnabb only, never precision (F.4.4)
  'R',
  ...MAGNUM_CODES,
].map(spsf);

export const GENERIC_WEAPON_GROUPS: readonly WeaponGroup[] = [
  { id: 'generic:airgun', code: 'airgun', federation: 'generic' },
];

const ALL_WEAPON_GROUPS: readonly WeaponGroup[] = [...SPSF_WEAPON_GROUPS, ...GENERIC_WEAPON_GROUPS];

export function findWeaponGroup(id?: string | null): WeaponGroup | null {
  if (!id) return null;
  return ALL_WEAPON_GROUPS.find((group) => group.id === id) ?? null;
}

/** Display code for a group id; '' when the id is unknown or absent. */
export function weaponGroupCode(id?: string | null): string {
  return findWeaponGroup(id)?.code ?? '';
}
