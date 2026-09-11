// External sites, as providers (ADR 0010). WebShooter is provider #1;
// pistol.nu and anything after it register here rather than growing a
// parallel stack or a pile of site checks in the screens.
//
// Nothing site-specific belongs in this file. A provider's API client,
// schemas and mapping stay in its own folder; what lives here is the
// descriptor the UI reads to decide what to offer.

/**
 * What a site can do for us.
 *
 * Declared rather than discovered, so an unsupported feature is a row the
 * UI never renders instead of a button that fails when pressed.
 */
export type ProviderCapability =
  /** Import my official competition results. */
  | 'importResults'
  /** Show my upcoming starts and patrol times. */
  | 'myStarts'
  /** Statistics the site computes that we do not. */
  | 'stats';

/** How the shooter proves who they are to the site. */
export type ProviderAuthMethod =
  /** Username/password exchanged for a token, device→site. */
  | 'password'
  /** A personal API token pasted in. */
  | 'token';

export interface ProviderDescriptor {
  /** Stable id. Used in settings keys and route params, so it never changes. */
  id: string;
  /** Shown as-is: a site's name is not translated. */
  displayName: string;
  /** Origin the shooter would visit, for "what is this?" copy. */
  siteUrl: string;
  capabilities: readonly ProviderCapability[];
  authMethods: readonly ProviderAuthMethod[];
}

export const WEBSHOOTER_PROVIDER_ID = 'webshooter';

const WEBSHOOTER: ProviderDescriptor = {
  id: WEBSHOOTER_PROVIDER_ID,
  displayName: 'WebShooter',
  siteUrl: 'https://webshooter.se/',
  // Fält results are listed by the API but not importable (integration
  // spec §D), which is a detail of importResults rather than a capability
  // of its own.
  capabilities: ['importResults', 'myStarts'],
  authMethods: ['password', 'token'],
};

/** Every provider the build knows about, in display order. */
export const PROVIDERS: readonly ProviderDescriptor[] = [WEBSHOOTER];

export function findProvider(id: string): ProviderDescriptor | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function providerSupports(
  provider: ProviderDescriptor,
  capability: ProviderCapability,
): boolean {
  return provider.capabilities.includes(capability);
}

/**
 * Settings key for "the shooter wants this site".
 *
 * Enablement is deliberately not the same as being connected: a provider
 * can be enabled and not yet connected (it shows up, and asks for
 * credentials), and connecting is what Settings does with it. Tools keys
 * off enablement alone, which is what keeps it clean.
 */
export function providerEnabledSettingKey(id: string): string {
  return `provider.${id}.enabled`;
}
