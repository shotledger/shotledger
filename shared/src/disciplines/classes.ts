// Klasser (the SHOOTER) — orthogonal to vapengrupp, never one string (§6.4a).
// SHB 2026 F.2.1 p. 163, variants F.2.5. Display convention "C 2" is
// F.2.6-F.2.7.
import { weaponGroupCode } from './groups';

export type ShooterClass = string;

// The F.2.5 variants of klass 1 (1u nybörjare, 1b bronsskytt, 1s silverskytt)
// are deliberately not offered — maintainer ruling 2026-09-09.
export const SPSF_SHOOTER_CLASSES: readonly ShooterClass[] = [
  '1',
  '2',
  '3', // riksmästarklass
  'Jun',
  'Dam1',
  'Dam2',
  'Dam3',
  'VetY', // year turning 60+
  'VetÄ', // year turning 70+
];

/** Federations without a klass concept (ISSF events, generic training). */
export const GENERIC_SHOOTER_CLASSES: readonly ShooterClass[] = [];

/** 'Dam1' -> 'Dam 1', 'VetY' -> 'Vet Y'; other codes are printed as stored. */
export function formatShooterClass(code?: string | null): string {
  if (!code) return '';
  const match = /^(Dam|Vet)(.+)$/.exec(code);
  return match ? `${match[1]} ${match[2]}` : code;
}

/** Combined display, e.g. 'C 2'. Omits whichever half is missing. */
export function formatGroupAndClass(groupId?: string | null, classCode?: string | null): string {
  return [weaponGroupCode(groupId), formatShooterClass(classCode)].filter(Boolean).join(' ');
}
