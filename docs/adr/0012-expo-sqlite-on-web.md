# ADR 0012: expo-sqlite runs on web under a non-static output

Status: proposed (2026-09-16)

## Context

ADR 0001 chose expo-sqlite for its web build, but under `web.output:
"static"` its WASM worker would not bundle, so the web target ran with
`db = null`. A spike for #277 (Expo SDK 57, expo-sqlite 57.0.3) showed the
app's own SQLite layer does run in a browser once four undocumented problems
are handled. ADR 0013 then decided the product web app does not use it; what
remains is the agentic web preview, a development surface.

## Decision

The web build runs the real expo-sqlite, which takes:

- **`web.output: "single"`** in `app/app.json`, so Metro splits the worker
  into its own chunk and ships `wa-sqlite.wasm` as an asset (`wasm` in
  `assetExts`, `app/metro.config.js`).
- **Cross-origin isolation.** The page needs
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`. Expo CLI 57
  serves the HTML outside `enhanceMiddleware`, so the Metro dev server cannot
  send them; the preview needs a header-adding proxy, and a real host sets
  them at the edge. Without them `client.web.ts` says so instead of failing
  on `SharedArrayBuffer`.
- **An async open.** A cold worker cannot answer `openDatabaseSync`, so the
  web `MigrationGate` opens with `openDatabaseAsync` before anything renders
  and `db` wraps its `prepareSync`.
- **A throwing OpenCV stub** (`opencv.web.ts`): expo-router evaluates every
  route at start, and `react-native-fast-opencv` looks up its native module at
  module scope.
- **`patches/expo-sqlite@57.0.3.patch`**, mirroring expo/expo#44148: the
  worker writes a sync result's length as one byte, truncating anything over
  255 bytes. Drop the patch once a release carries the fix.

Data lives in OPFS, per origin, best-effort and evictable; sync, not the
browser, is the durable copy.

## Consequences

- `db` is never `null` on web; the remaining `!db` guards are dead code
  (tracked on #277).
- `expo start --web` without the headers shows "Page is not cross-origin
  isolated" rather than a blank app.
- `web.output: "single"` gives up static pre-rendering; nothing used it.
- If the preview loop ever stops needing a database in the browser, the patch
  and the COOP/COEP requirement can go with nothing else depending on them.
