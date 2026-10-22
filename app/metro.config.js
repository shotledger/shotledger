const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required so Metro bundles the Drizzle SQL migration files (see
// babel.config.js's inline-import plugin and src/db/migrator.ts).
config.resolver.sourceExts.push('sql');

// expo-sqlite on web: the wa-sqlite WASM binary is an asset, and the sync
// API needs SharedArrayBuffer, which browsers only expose to cross-origin
// isolated pages (ARCHITECTURE.md § Web preview).
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
