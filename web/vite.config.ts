import { defineConfig } from 'vite';

// The Worker serves the build same-origin (ADR 0013). In dev, proxy the API
// to a local `wrangler dev` so sign-in stays same-origin too.
const api = process.env.SHOTLEDGER_API ?? 'http://localhost:8787';

export default defineConfig({
  server: {
    proxy: Object.fromEntries(['/api', '/sync', '/photos', '/account'].map((path) => [path, api])),
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
