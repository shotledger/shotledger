import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts', 'app/src/db/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    coverage: {
      provider: 'v8',
      // The old-coder gauntlet layer for M3: the shared scoring/discipline
      // modules are the code the maintainer does not read line by line, so
      // they carry a hard threshold. `vitest run --coverage` exits nonzero
      // when it is missed — a gauntlet layer, not a report.
      include: [
        'shared/src/scoring/**/*.ts',
        'shared/src/disciplines/**/*.ts',
        'shared/src/compliance/**/*.ts',
        'shared/src/sync/**/*.ts',
      ],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
