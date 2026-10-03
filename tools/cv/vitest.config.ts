import { defineConfig } from 'vitest/config';

// Not part of `pnpm check`: the eval and fit tools read photos from outside
// the repo, and a whole corpus takes minutes, hence the timeout.
export default defineConfig({
  test: {
    include: ['tools/cv/eval/*.eval.ts', 'tools/cv/fit/*.check.ts', 'tools/cv/*/*.tool.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});
