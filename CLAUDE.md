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

## Hard rules

1. Branch per change (`feat/…`, `fix/…`, `docs/…`); Conventional
   Commits; every commit DCO-signed (`git commit -s`). Never commit to
   `main`. Merges happen only after the maintainer's explicit OK.
2. Never: add dependencies not listed in the implementation plan without
   asking; change the DB schema without a Drizzle migration; weaken or
   delete a test to make it pass; build later-milestone features early.
3. Secrets never enter the working tree — they live under
   `~/agents/shotledger/`. Stage explicit paths only; never `git add -A`.
4. Anything marked `VERIFY:` in the docs is unconfirmed — stop and ask
   the maintainer; never guess regulatory or scoring values.
5. All UI strings via i18n (sv + en) from the first screen.
6. No Android-only native modules; platform quirks go behind wrappers in
   `app/src/platform/`.

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
  gitignored `app/android/` (and updates `app/app.json` with
  `android.package`, currently the prebuild default
  `com.anonymous.app`), downloads the NDK if missing, and can take
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
- Checks: `pnpm check` (= `pnpm typecheck && pnpm lint && vitest run &&
(cd app && pnpm exec jest --passWithNoTests)`), run from the repo
  root. `pnpm exec prettier --check .` is available separately
  (`pnpm format`) but not part of `check` per the implementation plan.
  Note `pnpm typecheck` (`tsc -b`) covers `shared/` and `backend/` only —
  the `app/` project is not in the build graph; check it by hand with
  `cd app && pnpm exec tsc --noEmit -p tsconfig.json` (three pre-existing
  M0/M1 errors there as of M3).
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
- Backend (`backend/`, hello-world only, never deployed by an agent):
  `cd backend && pnpm test` runs its own Cloudflare Workers vitest
  suite; not wired into the root `pnpm check` (out of scope until it
  ships real endpoints).
