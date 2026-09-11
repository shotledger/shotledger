// Where each provider's capabilities actually live.
//
// Kept in the app layer on purpose: `shared/` must not know expo-router
// paths (it has no RN imports at all), and a provider's screens are app
// concerns. The registry says WHAT a site can do; this says WHERE.
import type {
  ProviderCapability,
  ProviderDescriptor,
} from '@shotledger/shared/src/integrations/providers/registry';
import { WEBSHOOTER_PROVIDER_ID } from '@shotledger/shared/src/integrations/providers/registry';

type CapabilityRoutes = Partial<Record<ProviderCapability, string>>;

const ROUTES: Record<string, CapabilityRoutes> = {
  [WEBSHOOTER_PROVIDER_ID]: {
    importResults: '/webshooter/import',
    myStarts: '/webshooter/starts',
  },
};

/**
 * The capabilities a provider declares AND has a screen for, in registry
 * order. A declared capability with no route is a bug in this file rather
 * than something to render — so it is dropped rather than shown as a row
 * that goes nowhere.
 */
export function routedCapabilities(
  provider: ProviderDescriptor,
): { capability: ProviderCapability; route: string }[] {
  const routes = ROUTES[provider.id] ?? {};
  return provider.capabilities.flatMap((capability) => {
    const route = routes[capability];
    return route ? [{ capability, route }] : [];
  });
}
