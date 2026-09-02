import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'app/**'],
  },
});
