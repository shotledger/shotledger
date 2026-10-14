const { jestClassNameTemplate, reqstoolTestName } = require('../scripts/reqstool-stem.js');

// Same zone as vitest.config.ts: CI runs in UTC, where a local-day bug passes unseen.
process.env.TZ = 'Europe/Stockholm';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.(css|module\\.css)$': '<rootDir>/src/__mocks__/css.js',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/src/db/'],
  // A ratchet, not a target (#806): coverage of the app outside src/db (which
  // the root vitest run measures) when the floor was set, rounded down. Raise
  // it when coverage rises; never lower it to get a change through. Applies
  // when jest runs with --coverage, as `pnpm check` does.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/db/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__mocks__/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'json-summary'],
  coverageThreshold: {
    global: { lines: 39, functions: 28, branches: 33, statements: 40 },
  },
  // JUnit alongside the default reporter so `reqstool status` can see which
  // @SVCs-tagged test actually ran (ADR 0015).
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/../build/test-results',
        outputName: 'junit-jest.xml',
        classNameTemplate: jestClassNameTemplate,
        titleTemplate: ({ title }) => reqstoolTestName(title),
      },
    ],
  ],
};
