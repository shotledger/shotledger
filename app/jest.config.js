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
