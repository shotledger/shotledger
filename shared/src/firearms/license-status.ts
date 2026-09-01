// Pure license-expiry status math (§4 M4), driven off the latest license row
// for a firearm. `validUntil: null` means "tills vidare" (indefinite) — always valid.
import { LICENSE_EXPIRING_SOON_DAYS } from './constants';

export type LicenseStatus = 'none' | 'valid' | 'expiringSoon' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

export function licenseStatus(
  validUntil: string | null | undefined,
  now: Date = new Date(),
): LicenseStatus {
  if (validUntil === undefined) return 'none';
  if (validUntil === null) return 'valid'; // tills vidare
  const daysLeft = (new Date(validUntil).getTime() - now.getTime()) / DAY_MS;
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= LICENSE_EXPIRING_SOON_DAYS) return 'expiringSoon';
  return 'valid';
}
