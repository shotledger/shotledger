/**
 * Pure ownership check — old-coder scope, docs/specs/backend-auth-photos-spec.md
 * §6c. `'not_found'` covers both "resource doesn't exist" and "belongs to
 * someone else": a 403 would confirm the resource exists and is owned by
 * someone, leaking existence to a party with no right to know it (spec §5).
 */

export type OwnershipResult = 'ok' | 'not_found';

export function authorizeOwner(
  resourceOwnerId: string | undefined | null,
  requesterId: string,
): OwnershipResult {
  return resourceOwnerId != null && resourceOwnerId === requesterId ? 'ok' : 'not_found';
}
