/** Pure quota math — old-coder scope, docs/specs/backend-auth-photos-spec.md §6a. */

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'quota_exceeded';
}

/**
 * Boundary is inclusive: an upload that lands exactly at the limit is allowed.
 *
 * @Requirements BACKEND_001
 */
export function checkQuota(
  usedBytes: number,
  limitBytes: number,
  incomingBytes: number,
): QuotaCheckResult {
  const allowed = usedBytes + incomingBytes <= limitBytes;
  return allowed ? { allowed: true } : { allowed: false, reason: 'quota_exceeded' };
}

/**
 * Fail-closed floor: usage can never be driven below 0, whatever the delta.
 *
 * @Requirements BACKEND_001
 */
export function applyQuotaDelta(usedBytes: number, deltaBytes: number): number {
  return Math.max(0, usedBytes + deltaBytes);
}
