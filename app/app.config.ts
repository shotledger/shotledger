// app.json holds the config; this adds the version from package.json, which
// stays 0.0.0 in the repo and is stamped by the release workflow from the tag.
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { version } from './package.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  version,
});
