// Shooting-card-number normalization and identity resolution (spec §3,
// v2 spec §A.8/§A.10).

export class WebShooterIdentityUnresolvedError extends Error {
  constructor() {
    super('WebShooter identity could not be resolved: no override, stored value, or API result');
    this.name = 'WebShooterIdentityUnresolvedError';
  }
}

/**
 * Strips whitespace (space, tab, non-breaking space) and normalizes
 * None/missing/empty to `null`. Alpha prefixes ("A1234") and casing are
 * preserved verbatim — WebShooter card numbers are not documented
 * case-insensitive, so this never guesses at case folding.
 */
export function normalizeCardNumber(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const stripped = raw.replace(/\s/gu, '');
  if (stripped === '' || stripped === 'None') return null;
  return stripped;
}

/** `null` on either side never matches, even both `null`. */
export function cardNumbersMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normalizedA = normalizeCardNumber(a);
  const normalizedB = normalizeCardNumber(b);
  if (normalizedA === null || normalizedB === null) return false;
  return normalizedA === normalizedB;
}

export interface ResolveIdentityInput {
  override?: string | null;
  stored?: string | null;
  fetchAuthenticatedUser: () => Promise<{ shooting_card_number: string | null }>;
}

/**
 * Resolution order (spec §3/§A.10): explicit override, then previously
 * stored value, then a fresh `authenticate/user` call — only reaching the
 * network when both prior tiers miss.
 */
export async function resolveIdentity(input: ResolveIdentityInput): Promise<string> {
  const override = normalizeCardNumber(input.override);
  if (override !== null) return override;

  const stored = normalizeCardNumber(input.stored);
  if (stored !== null) return stored;

  const user = await input.fetchAuthenticatedUser();
  const fetched = normalizeCardNumber(user.shooting_card_number);
  if (fetched !== null) return fetched;

  throw new WebShooterIdentityUnresolvedError();
}
