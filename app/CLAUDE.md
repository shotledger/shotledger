# app/ — the Expo app

Rules that apply everywhere are in the root `AGENTS.md`. Running and driving
the app is the `run-app` skill.

## Checks specific to the app

- `pnpm typecheck:app` — the `app/` project is not composite, so the root
  `pnpm typecheck` (`tsc -b`) skips it; `pnpm check` runs both.
- `pnpm i18n:check` (`scripts/i18n-check.mjs`) — `app/src/i18n/{en,sv}.json`
  must have identical key sets, and every key must be referenced in
  `app/src`.
- **Fast Refresh does not reload the i18n resources.** A new key renders as
  its raw path (`compliance.criterionOtherFirearm`) until a cold start
  (`adb shell am force-stop` + relaunch). Restart before concluding a string
  is broken.

## Testing hooks

Jest (`jest-expo`) with `@testing-library/react-native`; the pattern is
`features/backup/use-backup-export-import.test.ts`.

- `await renderHook(...)`, and wrap every call that sets state in
  `await act(...)` — both are async in v14.
- Mock at the module boundary: `@/db/client` (getters, so a test can set
  `db` to `null`), `@/db/queries/*`, `@/db/backup/*`, `@/platform/*`.
  Keep pure helpers (`folder-state.ts`, `@shotledger/shared`) real.
- Module-level state (`features/sync/sync-controller.ts`) needs a fresh
  copy per test: `require` it inside `jest.isolateModules`, with fake
  timers for debounces and backoff.

## Testing screens and components

`src/test-utils/render.tsx` is the pattern (its header lists the three
`jest.mock` lines a screen test needs); `features/firearms/firearm-forms.test.tsx`
is a worked example.

- Seed and assert through the real query functions on the in-memory
  better-sqlite3 DB (`test-utils/test-db-client.ts`) — mock native modules,
  not the DB.
- Find things the way the user does: role and accessible name, label text,
  visible text. A `TextField` gets an `accessibilityLabel` of its field
  label, which screen readers need anyway.
- Screen tests live beside their feature, never under `src/app/` — expo-router
  bundles every file there as a route.

## Licenses

Adding or removing a dependency means running `pnpm licenses:generate` and
committing the regenerated `src/constants/licenses.json`.

- `licenses:generate` runs a real `expo export --source-maps` and derives the
  list from Metro's module graph, so it lists only what ships in the APK
  (~3 s warm, ~20 s cold). Not `pnpm licenses list --prod`: `expo` declares
  `@expo/cli` as a runtime dependency, which would credit metro, babel and
  terser.
- `pnpm licenses:check` (in `pnpm check`) validates the committed file:
  well-formed, sorted, no duplicates or build tooling, and every
  `name@version` still a direct `app` dependency in `pnpm-lock.yaml`. A
  Renovate PR that moves a bundled version therefore goes red until someone
  regenerates on that branch. It cannot see a package newly entering the
  bundle without a listed version moving — that case is still on you.
- A **native** dependency (a Gradle artifact, a vendored C/C++ library) is
  invisible to the script — hand-edit `src/constants/native-licenses.ts`.

## Database

- Schema changes go through a Drizzle migration (hard rule 2).
- **A baseline edit updates the `baseline sha256` line in `migrations.js`.**
  Babel's `inline-import` pastes the SQL into `migrations.js`, and Metro caches
  that transform by `migrations.js`'s own content, so without the line a build
  ships the old schema and the first write fails with `table … has no column
named …`. `migrations.test.ts` fails until the hash matches. An install that
  already ran the old baseline still needs `adb shell pm clear app.shotledger`.

## Demo data and dev tools

- `/dev` (`src/app/dev/index.tsx`) has "Load demo data" / "Wipe data";
  `/dev/components` is the component gallery. Both redirect to `/` outside
  dev builds (`src/app/dev/_layout.tsx`).
- Deep link `shotledger://dev` (the scheme is `shotledger`, distinctive so no
  other app can claim the redirects it will receive; #671).
- On web the DB needs the page cross-origin isolated; Metro cannot send the
  COOP/COEP headers, so put a header-adding proxy in front (ADR 0012).
- `EXPO_PUBLIC_ENABLE_DEV_TOOLS=1` at build time opens `/dev` in a release
  build. **Never set it for a Play build — it ships a wipe button.**

## Sync backend URL

`EXPO_PUBLIC_API_BASE_URL`, else `app.json`'s `expo.extra.apiBaseUrl`
(`https://web.shotledger.app`, the production Worker; #887). Never a secret — the session
token lives in SecureStore, never in the tree or the DB.
