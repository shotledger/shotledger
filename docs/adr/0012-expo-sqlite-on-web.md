# ADR 0012: expo-sqlite runs on web under a non-static output

Status: proposed (2026-09-16)

## Context

M1 shipped the web target without a database: expo-sqlite's WASM worker
would not bundle under `web.output: "static"` (Metro's serializer threw
`Worker chunk not found for: .../expo-sqlite/web/worker.ts`), so
`app/src/db/client.web.ts` exported `db = null` and every screen grew a
`!db` guard. ADR 0001 had picked expo-sqlite over op-sqlite _for_ its web
build. Issue #277 asks whether a web app is worth building and names this
as the one-day spike everything else depends on: if the phone app's own
SQLite runs in a browser, web is a third sync device (architecture A); if
not, only a separate read-only web app over `/sync/pull` remains (B).

## What was tried

Expo SDK 57 — expo 57.0.22, @expo/cli 57.0.24, @expo/metro-config 57.0.12,
expo-router 57.0.21, react-native 0.86.3, expo-sqlite 57.0.3, drizzle-orm
0.45.2 — in Chrome 153 on Linux, through the Metro dev server and through
`expo export --platform web`.

1. `web.output: "single"` in `app/app.json`.
2. `app/metro.config.js`: `wasm` added to `assetExts`, COOP/COEP headers in
   `server.enhanceMiddleware` — the expo-sqlite docs' recipe.
3. `client.web.ts` opening the database the way `client.ts` does.

## Result: it works, after four things the docs do not mention

**Bundling passes.** Under `single`, Metro splits `expo-sqlite/web/worker.ts`
into its own chunk (`worker-<hash>.js`, 133 KB exported) and ships
`wa-sqlite.wasm` (621 KB) as an asset. No serializer error, in dev or in
export. `pnpm licenses:generate` is unaffected: it exports Android.

**The docs' headers recipe does not reach the document.** Expo CLI 57 serves
the HTML from a `ManifestMiddleware` that is _prepended_ to the connect
stack, while `enhanceMiddleware` only wraps Metro's bundle handler
(`@expo/cli/build/src/start/server/metro/instantiateMetro.js`). The bundle
gets the headers, the page does not, so `crossOriginIsolated` is `false`
and expo-sqlite's sync channel dies on `SharedArrayBuffer is not defined`.
The installed expo-router plugin has no `headers` option either. The spike
verified through a 25-line reverse proxy that adds the two headers; a real
host sets them at the edge (a `_headers` rule or a Worker), and
`migration-gate.web.tsx` now names the cause instead of leaking the
`ReferenceError`.

**A cold worker cannot answer a sync open.** `openDatabaseSync` at import
time fails with `Sync operation timeout`: the spin-wait in
`invokeWorkerSync` gives up long before the worker has fetched its chunk and
compiled the WASM. So on web the connection is opened with
`openDatabaseAsync` by the web `MigrationGate` before anything renders, and
`db` is a Drizzle instance over a one-method client that forwards
`prepareSync` — the only call Drizzle's expo-sqlite session makes. Once the
worker is warm, the sync channel kept up with the migrations and the demo
seed (30 sessions, 1138 shots) without a timeout.

**expo-router evaluates every route at start, and one route is native-only.**
`session/[id]/scan.tsx` imports `react-native-fast-opencv`, whose
`NativeFastOpencv.js` calls `TurboModuleRegistry.getEnforcing('FastOpencv')`
at module scope, which kills the whole web bundle inside `getRoutes`. This
has been true since #33 (2026-09-02) and does not depend on the output mode;
`app/src/features/photo-scoring/opencv.web.ts` is a throwing stub so the app
boots. It was the only native lookup at module scope in the bundle.

**expo-sqlite 57.0.3 truncates sync results over 255 bytes.** In
`web/WorkerChannel.ts` the worker writes the result length with
`resultArray.set(new Uint32Array([length]), 0)` on a `Uint8Array`, which
stores one byte — `length % 256`. The main thread reads a `Uint32` back and
decodes that many bytes: the first firearm row (276 bytes) became
`Unterminated string in JSON at position 20`. Migrations passed only because
`run` results are tiny. The async path uses `postMessage` and is unaffected,
but Drizzle's driver is sync-only. The line is unchanged on expo/expo `main`
as of today; the fix exists as expo/expo#44148 (open since 2026-03-23,
unmerged), which writes and reads the length prefix through a `DataView`
and rejects an out-of-bounds length. The maintainer chose to carry that fix
as `patches/expo-sqlite@57.0.3.patch` (registered in `pnpm-workspace.yaml`),
to be dropped once a release carries it. With it applied, everything
downstream worked.

With those four in place: migrations ran in the browser (database file
4 KB → 188 KB), the `/dev` seed wrote 30 sessions, and a full page reload
showed the same 1138 shots / 30 sessions / 7 competitions on Home. The
exported build, served with the headers on a fresh origin, booted and ran the
migrations too. The console stayed clean apart from expo-sqlite's own
"synchronous SQLite operations" dev warning.

## Where the data lives

OPFS, through wa-sqlite's `AccessHandlePoolVFS`:
`navigator.storage.getDirectory()/expo-sqlite/`, a pool of randomly named
files of which one holds the database. It is per origin — scheme, host and
port — shared by every tab of that origin, survives reloads and browser
restarts, and is removed by "clear site data". `navigator.storage.persisted()`
was `false`: best-effort storage, evictable under pressure unless
`persist()` is requested. It needs a secure context (https or localhost) and,
for the sync API, cross-origin isolation.

## Decision

The spike passes: the phone app's own SQLite layer runs in a browser, so
architecture A — web as a third sync device, every feature one more route —
is viable, and B is not needed for any database reason. Before A is built:

- The expo-sqlite length bug is carried as a pnpm patch mirroring
  expo/expo#44148 (a hard-rule-2 decision, taken 2026-09-16). It goes when
  a release includes the fix.
- The host must send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`. The Metro dev server cannot
  in this SDK, so the web preview loop needs the proxy or an Expo CLI that
  can. Everything the page embeds cross-origin has to tolerate COEP.
- The platform wrappers #277 lists (SecureStore, file picking, audio, OCR,
  OpenCV beyond the stub) are still the 5–10 days it estimates.

Kept in the tree: `web.output: "single"`, the metro config, the web client
and gate, the OpenCV stub, the expo-sqlite patch. Not kept: the proxy.

## Consequences

- `db` is never `null` on web any more; the `!db` guards are dead code and
  can go when the screens are next touched.
- `expo start --web` without the headers now shows "Page is not cross-origin
  isolated" instead of a blank app — accurate, but the web preview is not a
  data-bearing surface until the headers are served.
- `web.output: "single"` gives up static pre-rendering; nothing used it.
- A wiped tab is not a wiped logbook, but a cleared site is: OPFS goes with
  the origin's data. Sync, not the browser, is the durable copy — which is
  what #277 assumes.
