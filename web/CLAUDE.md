# web/ — the web app

ARCHITECTURE.md § Web app: a separate complement over `/sync/pull`, served same-origin by the
Worker, keeping nothing after the tab closes (the session token is in
`sessionStorage`, the rows in memory). ARCHITECTURE.md § Web app: it writes only by pushing
whole rows through `/sync/push`, online, with no outbox. The writers are
`src/entry/` (series and fält), `src/settings/` (the synced settings),
`src/bulk/` (bulk edit) and `src/edit/` (one session's edit and delete); all
go through `shared/src/sync-client/` (`session-entry.ts`, `falt-entry.ts`,
`settings-edit.ts`, `bulk-edit.ts`, `ammo-lot-merge.ts`, `session-edit.ts`,
`direct-push.ts`).

- **Parity with the phone** (root `AGENTS.md` rule 11): every write mirrors
  a named phone function (`app/src/db/queries/`) and is tested against it on
  the phone's schema (`app/src/db/queries/web-*.test.ts`). The phone decides
  any open question; a gap is stated in the spec, never left silent.
- **Strings and tokens are the app's.** `src/i18n.ts` imports
  `app/src/i18n/{en,sv}.json`; `src/theme.ts` turns
  `shared/src/design-tokens` into CSS custom properties (`--primary`,
  `--data-viz-categorical-1`, `--space-three`, `--radius-medium`), so a colour
  in `styles.css` is a `var(--…)`, never a hex. `i18n:check` scans `web/src`
  too. Add a web-only string under the `web` namespace in both files.
- **Numbers come from `shared/src/analytics-rows`**, the same composition the
  phone runs. `src/stats-inputs.ts` maps the snake_case wire rows onto it.
  Tags and the birth year come from the synced `session_tags` and `settings`
  rows; tag names resolve through `shared/src/tags/canonical.ts`; the synced
  profile reads through `shared/src/sync-client/account-settings.ts`. Sessions
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
