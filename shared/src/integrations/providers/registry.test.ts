import { describe, expect, it } from 'vitest';

import {
  PROVIDERS,
  WEBSHOOTER_PROVIDER_ID,
  findProvider,
  providerEnabledSettingKey,
  providerSupports,
} from './registry';

describe('provider registry', () => {
  it('has Webshooter as provider #1', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([WEBSHOOTER_PROVIDER_ID]);
  });

  it('gives every provider a unique id', () => {
    // Ids key settings rows and route params, so a collision would silently
    // connect one site with another's credentials.
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares at least one capability and one auth method per provider', () => {
    // A provider with no capability is a row that does nothing; one with no
    // auth method cannot be connected at all.
    for (const provider of PROVIDERS) {
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.authMethods.length).toBeGreaterThan(0);
    }
  });

  it('answers capability questions from the declaration, not from guesswork', () => {
    const webshooter = findProvider(WEBSHOOTER_PROVIDER_ID)!;

    expect(providerSupports(webshooter, 'importResults')).toBe(true);
    expect(providerSupports(webshooter, 'myStarts')).toBe(true);
    // Webshooter has statistics of its own, but we do not read them; the
    // registry says what we support, not what the site happens to have.
    expect(providerSupports(webshooter, 'stats')).toBe(false);
  });

  it('returns null for an unknown id rather than throwing', () => {
    // A stale route param or a settings row from a build that had a
    // provider this one does not must not crash the screen.
    expect(findProvider('pistol.nu')).toBeNull();
  });

  it('namespaces the enabled setting per provider', () => {
    expect(providerEnabledSettingKey('webshooter')).toBe('provider.webshooter.enabled');
    expect(providerEnabledSettingKey('other')).not.toBe(providerEnabledSettingKey('webshooter'));
  });
});
