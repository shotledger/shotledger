module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    // Bundles the Drizzle SQL migration files as inline string imports —
    // required by src/db/migrator.ts. See metro.config.js for the matching
    // sourceExts entry.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
