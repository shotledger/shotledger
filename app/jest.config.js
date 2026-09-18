/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.(css|module\\.css)$': '<rootDir>/src/__mocks__/css.js',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/src/db/'],
};
