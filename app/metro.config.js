const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required so Metro bundles the Drizzle SQL migration files (see
// babel.config.js's inline-import plugin and src/db/migrator.ts).
config.resolver.sourceExts.push('sql');

module.exports = config;
