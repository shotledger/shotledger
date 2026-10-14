import { defineConfig } from 'vitest/config';

import { reqstoolTestName, vitestClassnameTemplate } from './scripts/reqstool-stem.js';
import stryker from './stryker.config.json' with { type: 'json' };

// One list of gauntlet modules: Stryker's `mutate`, negations last.
const gauntletInclude = stryker.mutate.filter((glob) => !glob.startsWith('!'));
const gauntletExclude = stryker.mutate
  .filter((glob) => glob.startsWith('!'))
  .map((glob) => glob.slice(1));

// Each gauntlet glob carries 100 % on its own files.
const gauntletThresholds = Object.fromEntries(
  gauntletInclude.map((glob) => [glob, { 100: true as const }]),
);

// The ratchet for everything else (#806): total coverage when the floor was
// set, rounded down. The gauntlet files sit at 100 %, so any drop comes from
// code outside it. Raise it when coverage rises; never lower it to get a
// change through.
const COVERAGE_FLOOR = { lines: 80, functions: 73, branches: 79, statements: 81 };

// The users' zone, with daylight saving. CI runs in UTC, where local time and
// UTC agree and a local-day bug passes unseen.
process.env.TZ = 'Europe/Stockholm';

export default defineConfig({
  test: {
    include: [
      'shared/**/*.test.ts',
      'backend/**/*.test.ts',
      'app/src/db/**/*.test.ts',
      'web/src/**/*.test.ts',
    ],
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
      // The old-coder gauntlet: the modules the maintainer does not read line
      // by line carry a hard threshold. `pnpm check` runs with `--coverage`,
      // so missing it fails the build — a gauntlet layer, not a report.
      // Everything else these tests reach carries the floor below. The
      // backend's routes run in workerd (backend/vitest.config.mts) and are
      // not measured here.
      include: [
        ...gauntletInclude,
        'shared/src/**/*.ts',
        'backend/src/lib/**/*.ts',
        'app/src/db/**/*.ts',
        'web/src/**/*.{ts,tsx}',
      ],
      exclude: [...gauntletExclude, '**/*.test.ts', '**/fixtures.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        ...COVERAGE_FLOOR,
        ...gauntletThresholds,
      },
    },
  },
});
