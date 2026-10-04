// Pure license-expiry status math (§4 M4), driven off the latest license row
// for a firearm. `validUntil: null` means "tills vidare" (indefinite) — always valid.
import { LICENSE_EXPIRING_SOON_DAYS } from './constants';
import { calendarDaysUntil, parseLocalDay } from '../dates';

export type LicenseStatus = 'none' | 'valid' | 'expiringSoon' | 'expired';

/** `validUntil` is the last valid day ("giltig t.o.m."): valid through the
 *  end of that local day, expired from the local midnight after it. */
export function licenseStatus(
  validUntil: string | null | undefined,
  now: Date = new Date(),
): LicenseStatus {
  if (validUntil === undefined) return 'none';
  if (validUntil === null) return 'valid'; // tills vidare
  const lastDay = parseLocalDay(validUntil);
  // Fail closed: a value that is not a date must not pass for a valid license.
  if (lastDay === null) return 'expired';
  const daysLeft = calendarDaysUntil(lastDay, now);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= LICENSE_EXPIRING_SOON_DAYS) return 'expiringSoon';
  return 'valid';
}
