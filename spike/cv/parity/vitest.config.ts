import { defineConfig } from 'vitest/config';

// Not part of `pnpm check`: it reads photos from outside the repo (see
// closeup.parity.ts). A whole corpus takes minutes, hence the timeout.
export default defineConfig({
  test: {
    include: ['spike/cv/parity/*.parity.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});
