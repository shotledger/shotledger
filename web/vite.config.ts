import { defineConfig } from 'vite';

// The Worker serves the build same-origin (ARCHITECTURE.md § Web app). In dev, proxy the API
// to a local `wrangler dev`, presenting its own origin: better-auth refuses
// any other.
const api = process.env.SHOTLEDGER_API ?? 'http://localhost:8787';
const target = { target: api, changeOrigin: true, headers: { origin: api } };

export default defineConfig({
  server: {
    proxy: Object.fromEntries(
      ['/api', '/sync', '/photos', '/account'].map((path) => [path, target]),
    ),
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
