import { defineConfig } from 'vitest/config';

import { reqstoolTestName, vitestClassnameTemplate } from './scripts/reqstool-stem.js';
import stryker from './stryker.config.json' with { type: 'json' };

// One list of gauntlet modules: Stryker's `mutate`, negations last.
const gauntletInclude = stryker.mutate.filter((glob) => !glob.startsWith('!'));
const gauntletExclude = stryker.mutate
  .filter((glob) => glob.startsWith('!'))
  .map((glob) => glob.slice(1));

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
      include: gauntletInclude,
      exclude: gauntletExclude,
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
