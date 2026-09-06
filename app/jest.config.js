// Moved out of package.json so transformIgnorePatterns can be derived from
// jest-expo's rather than copied — see below.
const preset = require('jest-expo/jest-preset');

// jest-expo's first pattern is an allowlist: everything under node_modules is
// left untransformed except the packages named in its negative lookahead.
// `@noble/hashes` (the backup passphrase KDF, via @shotledger/shared) is
// ESM-only, so Jest's CommonJS loader cannot require it untransformed. Metro
// and tsc resolve it natively; only Jest needs this.
const ALLOWLIST_PREFIX = '/node_modules/(?!(';
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) =>
  pattern.startsWith(ALLOWLIST_PREFIX)
    ? pattern.replace(ALLOWLIST_PREFIX, `${ALLOWLIST_PREFIX}@noble|`)
    : pattern,
);
if (transformIgnorePatterns.every((pattern) => !pattern.includes('@noble'))) {
  throw new Error(
    'jest-expo no longer exposes the node_modules transform allowlist in the expected shape; ' +
      '@noble/hashes must be added to transformIgnorePatterns by hand.',
  );
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.(css|module\\.css)$': '<rootDir>/src/__mocks__/css.js',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/src/db/'],
  transformIgnorePatterns,
};
