import { defineConfig } from 'vitest/config';

import { reqstoolTestName, vitestClassnameTemplate } from './scripts/reqstool-stem.js';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts', 'app/src/db/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    // JUnit alongside the default reporter so `reqstool status` can see which
    // @SVCs-tagged test actually ran (ADR 0015). `classnameTemplate` is what
    // makes a testcase match its annotation.
    reporters: [
      'default',
      [
        'junit',
        {
          outputFile: 'build/test-results/junit-vitest.xml',
          classnameTemplate: vitestClassnameTemplate,
          titleTemplate: ({ title }: { title: string }) => reqstoolTestName(title),
        },
      ],
    ],
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
        'shared/src/integrations/webshooter/**/*.ts',
        'shared/src/shotlog/**/*.ts',
        'shared/src/sync/**/*.ts',
        'shared/src/sync-client/*.ts',
        'backend/src/lib/quota.ts',
        'backend/src/lib/rate-limit.ts',
        'backend/src/lib/authz.ts',
        'shared/src/timer/**/*.ts',
        'shared/src/target-scoring/**/*.ts',
        'shared/src/json-export/**/*.ts',
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
