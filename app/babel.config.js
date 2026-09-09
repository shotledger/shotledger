const path = require('path');

// babel-preset-expo is a transitive dependency of expo, and pnpm's strict
// layout means a bare name does not resolve from here or from the workspace
// root — the release bundler fails with "Cannot find module
// 'babel-preset-expo'". Resolving through expo finds the peer-resolved copy
// that is actually installed.
const babelPresetExpo = require.resolve('babel-preset-expo', {
  paths: [path.dirname(require.resolve('expo/package.json'))],
});

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [babelPresetExpo],
    // Bundles the Drizzle SQL migration files as inline string imports —
    // required by src/db/migrator.ts. See metro.config.js for the matching
    // sourceExts entry.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
