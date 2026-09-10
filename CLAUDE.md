# ShotLedger — agent instructions

Free, open-source (private for now) target-shooting logbook app.
React Native + Expo + TypeScript; local-first SQLite; optional Cloudflare
sync. Android first — **all code must stay iOS-compatible**.

## Read before working

- `plan.md` — what and why; decisions log; roadmap. Update it in the
  same branch as the change it describes.
- `docs/implementation-plan.md` — the execution spec: milestones,
  schema, screen inventory, per-task acceptance criteria. Follow it;
  do not improvise product decisions.
- `docs/reference/spsf-shb-2026.md` — verified domain facts (SPSF rules,
  thresholds, targets) with page citations. The `spsf-domain` skill
  summarizes the hard rules — it triggers on scoring/compliance work.
- `docs/adr/` — architecture decision records. Add one when changing an
  architectural decision; never silently contradict an accepted ADR.
- `.claude/skills/old-coder/` — evidence-first development loop (vendored
  from AmazingAng/old-coder, MIT). **Mandatory for changes to
  `shared/scoring/`, `shared/compliance/`, `shared/csv/`, and the sync
  engine** — the maintainer does not read that code line by line; the
  approved spec and evidence report are the review. Routine UI work uses
  normal tests instead.
- **Issue [#138](https://github.com/jimisola/shotledger/issues/138)** —
  maintainer UI/UX feedback and everything else outstanding, tracked to
  completion (`gh issue view 138`). It replaced `docs/feedback-backlog.md`.
  Check it before starting UI work, and tick the items your change closes
  (`gh issue edit 138 --body-file …`) in the same branch — noting anything
  you decided or could not resolve as a comment (`gh issue comment 138`).
- `docs/release.md` — the repeatable release checklist (maintainer-only
  one-time setup vs. every-release steps); `docs/store-listing.md` — the
  draft EN/SV store listing. Both from M7; update `docs/release.md` if
  the EAS/Play flow changes.

## Hard rules

1. Branch per change (`feat/…`, `fix/…`, `docs/…`); Conventional
   Commits; every commit DCO-signed (`git commit -s`). Never commit to
   `main`. Merges happen only after the maintainer's explicit OK.
2. Never: add dependencies not listed in the implementation plan without
   asking; change the DB schema without a Drizzle migration; weaken or
   delete a test to make it pass; build later-milestone features early.
   Adding or removing a dependency also means running
   `pnpm licenses:generate` and committing the regenerated
   `app/src/constants/licenses.json`. A **native** dependency (a Gradle
   artifact, a vendored C/C++ library) is invisible to that script —
   hand-edit `app/src/constants/native-licenses.ts` instead.
3. Secrets never enter the working tree — they live under
   `~/agents/shotledger/`. Stage explicit paths only; never `git add -A`.
4. Anything marked `VERIFY:` in the docs is unconfirmed — stop and ask
   the maintainer; never guess regulatory or scoring values.
5. All UI strings via i18n (sv + en) from the first screen. **Casing:**
   English screen titles, section headers, field labels, tab labels and
   button labels are **Title Case** ("Account & Sync", "Birth Year",
   "Shot Timer"); English body copy, help text, placeholders and
   subtitles stay sentence case. Swedish is **sentence case
   throughout** — Title Case is not a Swedish convention ("Konto och
   synk", "Födelseår"). Same rule already applied to discipline names
   (decisions log, 2026-09-01).
6. No Android-only native modules; platform quirks go behind wrappers in
   `app/src/platform/`.
7. **Never commit PII.** No license cards or license numbers, no personal
   photos (target photos included), no names, shooter/card ids, WebShooter
   or ShotLog exports, or any other real person's data — the maintainer's
   or anyone else's — in code, fixtures, tests, docs, screenshots, or
   commit messages. Real samples the maintainer supplies stay outside the
   working tree (e.g. `~/tmp/`, `~/agents/shotledger/`); read them to
   learn the shape, then write **synthetic** fixtures. A screenshot taken
   with real data is not committable — use the `/dev` demo data.

## Definition of done

Code + tests written; `pnpm check` green; the relevant checkbox ticked
in `docs/implementation-plan.md` on the same branch; UI tasks include a
screenshot from the agentic loop.

## Agentic loop (verified at M0 scaffold — keep this section updated)

- Install: `pnpm i` (repo root; pnpm workspace covers `app/`, `shared/`,
  `backend/`). First install on a new machine also needs
  `pnpm approve-builds esbuild workerd` (native build scripts pnpm
  blocks by default — esbuild for bundling, workerd for
  `backend`'s Cloudflare Workers vitest pool).
- Web preview (primary UI iteration surface): `cd app && pnpm exec expo
start --web --port <port>` (backgrounded), poll
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/`
  until it returns `200`, then view/interact/screenshot via browser
  tooling. Kill the server (`pkill -f 'expo start --web'`) when done —
  never leave it running.
- Android: toolchain installed under `~/Android/Sdk` (platform 36,
  emulator, JDK 21 at `~/.sdkman/candidates/java/21.0.12-tem` — system
  Java 25 does NOT work with Android Gradle). Env comes from `.envrc`
  (direnv) or source the equivalent exports manually. Emulator:
  `emulator -avd shotledger -no-window -no-audio -gpu
swiftshader_indirect`, wait for `adb wait-for-device shell getprop
sys.boot_completed` → 1 (~2 min), screenshot via `adb exec-out
screencap -p > shot.png`, kill with `adb emu kill`. Dev build: `cd app
&& pnpm exec expo run:android` with the emulator already running and
  visible to `adb devices` (omit `--device` — it wants an AVD/UDID
  picker name, not the `adb` serial `emulator-5554`, and errors
  `CommandError: Could not find device with name: emulator-5554` if
  given one). First run does an implicit `expo prebuild`: generates the
  gitignored `app/android/` from `app/app.json`'s `android.package`,
  which is **`app.shotledger`** (set at M7 — it is no longer the
  prebuild default `com.anonymous.app`, so `adb shell pm list packages`
  and `am start` must use `app.shotledger`), downloads the NDK if
  missing, and can take
  10+ minutes end to end — subsequent builds are much faster
  (Gradle daemon + cache reuse). Maestro 2.10+ at
  `~/.maestro/bin/maestro`; flows in `app/e2e/`
  (`maestro test e2e/<flow>.yaml`), e.g. `app/e2e/m2-smoke.yaml`.
- Seed/wipe demo data: `/dev` route (`app/src/app/dev/index.tsx`), "Load
  demo data" / "Wipe data" buttons — reachable from a dev build via the
  deep link `app://dev` (scheme is `app`, per `app/app.json`; there is
  no `shotledger://` scheme). Native only for now — expo-sqlite's web
  build doesn't bundle under this Expo SDK's static web export (`db` is
  `null` on web, see `app/src/db/client.web.ts`). `/dev` and
  `/dev/components` (component gallery) redirect to `/` outside dev
  builds (`app/src/app/dev/_layout.tsx`, `__DEV__` check). In a Maestro
  flow, `openLink` right after `launchApp` can race the JS bundle's
  linking listener and silently no-op — wait for a screen to be visible
  first (see `app/e2e/m2-smoke.yaml`).
- Maestro gotchas found in M4: after `inputText` on a field near the
  bottom of a scrollable form, the keyboard covers the next target —
  `pressKey: Back` closes it before `scrollUntilVisible`/`tapOn` (avoid
  `hideKeyboard` and `waitForAnimationToEnd`, both observed to hang
  indefinitely in this sandbox rather than returning). Killing a stuck
  `maestro` process with `pkill -9` leaves a stale adb/gRPC connection
  (`UNAVAILABLE`/"Command failed... closed" on the next run) — run `adb
kill-server && adb start-server` before retrying. This sandbox's
  software-rendered emulator (`-gpu swiftshader_indirect`) is also
  markedly slower and less consistent step-to-step than a real device;
  expect individual `tapOn`/`inputText` steps to occasionally take 30s+.
  On a longer flow (~25+ steps deep) this sandbox has reproducibly hit
  `maestro.android.DeviceServerDiedException: ... DEADLINE_EXCEEDED after
120s` on `inputText` (the on-device maestro-driver gRPC server itself
  stops responding, not a step in the flow) — a real limitation of this
  sandboxed emulator instance, not the app or the flow; `adb kill-server
&& adb start-server` plus a retry is the only known recovery, and it
  does not always succeed on the first retry either.
- Checks: `pnpm check` (= `pnpm typecheck && pnpm typecheck:app && pnpm
i18n:check && pnpm licenses:check && pnpm lint && pnpm format && vitest run
&& (cd app && pnpm exec jest --passWithNoTests)`), run from the repo root.
  `pnpm licenses:check` (`scripts/generate-licenses.mjs --check`) is a cheap
  invariant gate on the committed `app/src/constants/licenses.json` (~30 ms:
  parses, non-empty, every entry has name/version/license, sorted, no
  duplicates, no build tooling). It does **not** regenerate — that is
  `pnpm licenses:generate`, which runs a real `expo export --source-maps` and
  derives the list from Metro's module graph (~3 s with a warm metro cache,
  ~20 s cold and ~3.5 CPU-minutes, plus ~20 MB of scratch in `$TMPDIR`), so it
  stays manual/CI-only. Scoping it to the bundle rather than to
  `pnpm licenses list --prod` is deliberate: `expo` declares `@expo/cli` as a
  runtime dependency, so `--prod` credits metro, babel and terser, none of
  which ship in the APK. `pnpm i18n:check`
  (`scripts/i18n-check.mjs`) gates on `app/src/i18n/{en,sv}.json` having
  identical key sets and every key actually referenced in `app/src`.
  `pnpm format` (`prettier --check .`) joined `check` in `feat/polish-1`
  once the pre-M3 formatting debt was cleared; `.claude/skills/old-coder/`
  is prettier-ignored (vendored, kept byte-for-byte with upstream).
  `pnpm typecheck` (`tsc -b`) covers `shared/` and `backend/` only — the
  `app/` project isn't composite so it can't join that build graph, but
  `check` also runs `pnpm typecheck:app` (`cd app && pnpm exec tsc
--noEmit -p tsconfig.json`) as a separate step (wired up in
  `feat/polish-1`, after fixing the two remaining M0/M1-vintage errors).
- Evidence-first layers (M3 onwards, for `shared/scoring` and friends):
  `pnpm coverage` (vitest + v8, 100% threshold on
  `shared/src/{scoring,disciplines}`, exits nonzero when missed),
  `pnpm mutation` (Stryker; `stryker.config.json` sets `ignoreStatic`
  because the vitest runner cannot activate mutants in module-load code),
  `pnpm mutation:schema` (on-disk mutation of the zod schemas, which is
  what `ignoreStatic` skips). `pnpm gauntlet` runs every layer.
- M5 found the M2-documented `launchApp`→`openLink` race reproducible enough
  to need mitigation, not just a known flake: a bounded, non-failing
  `extendedWaitUntil` on a nonexistent id (`timeout` acts as a plain delay
  since `extendedWaitUntil` — unlike `assertVisible` — does not fail the
  flow when its condition is never met) before the first `openLink`, plus a
  one-shot retry via `runFlow: {when: {notVisible: '<target>'}, commands:
[openLink: ...]}`, made `app://dev` reliable across repeated runs. See
  `app/e2e/m5-stats.yaml`.
- **Never edit files in the working tree while a Maestro flow is running**
  against a Metro dev build: Metro hot-reloads, the dev client returns to
  the initial route, and the flow fails on a screen that vanished under
  it. Also, `extendedWaitUntil` does not scroll — wait for an element that
  stays on screen (e.g. `session-total`), or use `scrollUntilVisible`.
- **Stale dev-client APK on a shared emulator** (found M-backup verification):
  when another worktree/agent's `expo run:android` last installed onto the
  same AVD, running your own `expo run:android --port <N>` can silently do
  nothing — Gradle sees the native project as up to date and skips
  repackaging, so the installed APK keeps its old build's dev-server target
  (visible as `ReactNativeJNI`/`BridgelessReact` log lines connecting to a
  different `10.0.2.2:<port>` than yours, or missing UI that exists in your
  source and in your own Metro's bundle output). `adb install -r` of an
  unchanged APK doesn't fix it either. Force it: `cd android && ./gradlew
assembleDebug --rerun-tasks -PreactNativeDevServerPort=<port>`, then
  `adb install -r app/build/outputs/apk/debug/app-debug.apk` explicitly
  rather than trusting the Expo CLI's own install step.
- **Standalone build for a phone** (no Metro, no EAS account): `cd app &&
pnpm exec expo prebuild --platform android --no-install`, then `cd android &&
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`. The Expo
  template signs `release` with the debug keystore, so the APK installs by
  `adb install -r` and updates in place over another debug-signed build without
  losing data. Restricting the ABI cuts a 295 MB universal APK to 90 MB.
  `EXPO_PUBLIC_ENABLE_DEV_TOOLS=1` at build time opens `/dev` and adds a
  Developer row in Settings so demo data is reachable in a release build —
  **never set it for a Play build; it ships a wipe button.** Note a release
  build bundles JS at build time, so it fails immediately on any bundling
  problem a dev build would only hit once Metro serves.
- Backend (`backend/`, never deployed by an agent — `wrangler deploy` is
  forbidden): `cd backend && pnpm test` runs its own Cloudflare Workers
  vitest suite; not wired into the root `pnpm check`. On this sandbox the
  Workers pool is slow enough that `test/sync.spec.ts`'s 205-row pagination
  case can exceed vitest's default 5 s timeout — a sandbox artifact, not a
  regression; re-run with `npx vitest run test/sync.spec.ts
--testTimeout=60000` to confirm.
- **Sync client end-to-end** (`backend/test/sync-client.spec.ts`, added in
  `feat/sync-app`): drives the real `runSyncCycle` from
  `shared/src/sync-client` and the real HTTP transport against the real
  Worker _in-process_ on the Workers pool — real D1, R2 and better-auth,
  `app.fetch` as the transport, two in-memory `LocalStore` "devices" on one
  account. No `wrangler dev` process, no network, nothing deployed. Run it
  with `cd backend && npx vitest run test/sync-client.spec.ts
--testTimeout=60000`. This is the cheapest way to exercise a sync change
  end to end; prefer it over the emulator.
- **`expo run:android` ignores `ANDROID_SERIAL`.** With several emulators up
  it picks one of its own choosing and can install over another agent's
  build (observed in `feat/sync-app`: it targeted `shotledger` while
  `ANDROID_SERIAL=emulator-5560`). Let it build, then install and launch by
  hand on the intended device: `adb -s <serial> install -r -d
app/android/app/build/outputs/apk/debug/app-debug.apk`, `adb -s <serial>
reverse tcp:<metro-port> tcp:<metro-port>`, then `adb -s <serial> shell am
start -a android.intent.action.VIEW -d
"app://expo-development-client/?url=http%3A%2F%2Flocalhost%3A<metro-port>"`.
  Map a serial to its AVD with `adb -s <serial> emu avd name`.
- Sync backend URL for a device build: `EXPO_PUBLIC_API_BASE_URL`, else
  `app.json`'s `expo.extra.apiBaseUrl` (placeholder
  `https://api.shotledger.app`). Never a secret — the session token lives in
  SecureStore, never in the tree or the DB.
- **Verify UI/UX changes by navigating the running app, not by reading the
  source.** Read the code to find where to fix, then drive the actual app —
  tap, swipe, screenshot — to confirm the fix (or to check whether a reported
  bug already exists in the current build at all). Several real findings only
  turned up this way and would not have from a code read: a shot-entry
  auto-advance the maintainer thought was missing was already correct, a
  swipe-to-delete-with-confirmation flow already worked, and a genuine bug
  (an empty, orphaned series left behind when "Add Series" is backed out of
  without saving) was only visible by actually doing it. Default to the
  **emulator**, not a maintainer's physical device — it drives identically
  (same `adb`, same taps/swipes/screenshots) and doesn't have a phone's flaky
  USB connection to fight; reach for a real device only for something
  genuinely hardware-dependent (camera, sensors, real Bluetooth/USB
  peripherals).
  - Headless emulator + install, reusing an already-built APK:
    `emulator -avd shotledger -no-window -no-audio -gpu swiftshader_indirect &`,
    then `adb wait-for-device`, poll
    `adb shell getprop sys.boot_completed` for `1`, then
    `adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk`.
    A debug build needs Metro serving: `adb reverse tcp:8081 tcp:8081` +
    `expo start --port 8081` (backgrounded; poll
    `curl -s -o /dev/null -w '%{http_code}' http://localhost:8081/status`
    for `200`), then launch via
    `adb shell am start -a android.intent.action.VIEW -d "app://dev" app.shotledger`
    (or `am start -a android.intent.action.VIEW -d "app://" app.shotledger` for
    Home; `monkey -p app.shotledger -c android.intent.category.LAUNCHER 1`
    also launches but injects one random touch event first — fine for a cold
    start, never use it once you're mid-flow, it can land on and activate
    whatever's under it).
  - Interact with `adb shell input tap <x> <y>` / `input swipe <x1> <y1> <x2>
<y2> <duration_ms>`, and capture with
    `adb exec-out screencap -p > shot.png` then Read the PNG.
  - **Coordinate scaling gotcha (hit repeatedly — check every time):** `input
tap`/`input swipe` take coordinates in the device's real pixel space
    (`adb shell wm size`, e.g. `1080x2400`), but a screenshot you Read back is
    very often shown to you downscaled, with the tool telling you the
    displayed size and a multiply factor (e.g. "displayed at 900x2000...
    multiply by 1.20"). Tapping the raw displayed-image coordinate instead of
    multiplying it up hits the wrong element — silently, since the tap still
    "succeeds" against whatever happens to be there. Always convert
    (`displayed_x * factor`, `displayed_y * factor`) before every tap, not
    just the first one in a sequence.
  - Screenshot again after every tap before reasoning about what happened —
    a tap can land on the wrong control, or the screen can be mid-transition,
    and the next screenshot is what tells you which.
- **A stuck emulator can serve a phantom pre-edit bundle that survives every
  ordinary fix** (found in `fix/session-detail-ui`): after this sandbox's
  System UI ANR'd mid-session (a `System UI isn't responding` dialog that
  didn't clear even after `input keyevent KEYCODE_BACK`/waiting), the app
  kept rendering an OLDER version of a screen than what was on disk and in
  the Metro bundle — confirmed stale by checking the actual file content,
  clearing Metro's cache (`--clear`), restarting Metro, and even a full
  `am force-stop` + relaunch, none of which helped. Only `adb uninstall
app.shotledger` followed by a fresh `adb install` fixed it — something
  about the wedged process/APK state survived every softer reset. If a
  screen stops matching its source after any ANR or unexpected app exit to
  the launcher, don't trust further debugging on that install; uninstall
  and reinstall before spending more time on it.
