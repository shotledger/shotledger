import { Hono } from 'hono';

import {
  appleAppSiteAssociation,
  appleTeamId,
  assetLinks,
  signingFingerprints,
} from '../lib/app-association';

/**
 * The association files the OS fetches before it lets the phone app use this
 * domain's passkeys (#681). Built from `ANDROID_SIGNING_CERT_SHA256` and
 * `APPLE_TEAM_ID` (wrangler.jsonc), so no placeholder file is ever served: an
 * env without the value answers 404. Both must be served from the rp id's
 * host, as JSON, with no redirect.
 */
export function createWellKnownRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/assetlinks.json', (c) => {
    const fingerprints = signingFingerprints(c.env.ANDROID_SIGNING_CERT_SHA256);
    if (fingerprints.length === 0) return c.notFound();
    return c.json(assetLinks(fingerprints));
  });

  app.get('/apple-app-site-association', (c) => {
    const teamId = appleTeamId(c.env.APPLE_TEAM_ID);
    if (teamId === null) return c.notFound();
    return c.json(appleAppSiteAssociation(teamId));
  });

  return app;
}
