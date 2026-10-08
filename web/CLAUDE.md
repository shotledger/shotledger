# web/ — the read-only web app

ADR 0013: a separate read-only complement over `/sync/pull`, served
same-origin by the Worker. It never writes, and keeps nothing after the tab
closes (the session token is in `sessionStorage`, the rows in memory).

- **Strings and colours are the app's.** `src/i18n.ts` imports
  `app/src/i18n/{en,sv}.json` and `src/theme.ts` imports
  `app/src/theme/colors.ts`; `i18n:check` scans `web/src` too. Add a web-only
  string under the `web` namespace in both files.
- **Numbers come from `shared/src/analytics-rows`**, the same composition the
  phone runs. `src/stats-inputs.ts` maps the snake_case wire rows onto it.
  Tags and the birth year come from the synced `session_tags` and `settings`
  rows; tag names resolve through `shared/src/tags/canonical.ts`. Sessions
  (`src/sessions/browse.ts`) join through the export's `sessionExportsFromRows`
  and score with `shared/src/scoring`. App code without a react-native import
  (labels, formatters) is imported directly rather than restated.
- **Pages are hash routes** (`src/shell/route.ts`, `pages` in
  `src/shell/shell.tsx`); the shell is plain CSS and inline SVG icons, no UI
  or router dependency.
- **The CSP is strict** (`public/_headers`): no inline `<style>` or
  `<script>`, no `eval`. Style through `styles.css`, a `style` prop or a
  constructed sheet (`theme.ts`). Check a change in a browser against
  `wrangler dev` (below) for console CSP errors; `vite` dev does not send
  the headers.
- Photos need the bearer header, so an `<img>` cannot fetch them: lease a blob
  URL from `src/sessions/photo-urls.ts`, which shares and revokes them.
- `pnpm typecheck:web` is in `pnpm check`; tests are vitest (`web/src/**/*.test.ts`).

## Running it

Against a local Worker (seed an account through `/sync/push` first):

```bash
cd backend && pnpm exec wrangler d1 migrations apply DB --local && pnpm exec wrangler dev --port 8787
cd web && pnpm exec vite          # proxies /api, /sync, /photos, /account to :8787
```

Or build it and let the Worker serve it: `pnpm --filter @shotledger/web build`,
then `wrangler dev` serves `web/dist` at `/`.
