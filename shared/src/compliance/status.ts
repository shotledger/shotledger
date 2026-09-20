// The green/amber/red banding, shared by the 5 §/6 § license activity and the
// per-firearm criteria so the two cannot drift apart. The banding itself is an
// app-level UX choice documented in m6-compliance-spec.md, not a regulation:
// the source states a threshold, and "amber" is this app's way of saying
// "close" rather than a level anyone certifies.
import type { LicenseActivityStatus } from './types';

export function statusFor(count: number, required: number): LicenseActivityStatus {
  if (required <= 0) return 'green';
  if (count >= required) return 'green';
  if (count >= Math.ceil(required / 2)) return 'amber';
  return 'red';
}
