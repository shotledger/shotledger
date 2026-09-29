import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    // `tsc -b` emits compiled copies of the tests into dist/.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
