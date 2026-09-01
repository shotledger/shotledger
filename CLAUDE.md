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
screencap -p > shot.png`, kill with `adb emu kill`. Maestro 2.10+ at
  `~/.maestro/bin/maestro`; flows in `app/e2e/`
  (`maestro test e2e/<flow>.yaml`).
- Seed/wipe demo data: `/dev` route (`app/src/app/dev/index.tsx`), "Load
  demo data" / "Wipe data" buttons. Native only for now — expo-sqlite's web
  build doesn't bundle under this Expo SDK's static web export (`db` is
  `null` on web, see `app/src/db/client.web.ts`); the deep link
  `shotledger://dev/seed` is still planned, not wired up.
- Checks: `pnpm check` (= `pnpm typecheck && pnpm lint && vitest run &&
(cd app && pnpm exec jest --passWithNoTests)`), run from the repo
  root. `pnpm exec prettier --check .` is available separately
  (`pnpm format`) but not part of `check` per the implementation plan.
- Backend (`backend/`, hello-world only, never deployed by an agent):
  `cd backend && pnpm test` runs its own Cloudflare Workers vitest
  suite; not wired into the root `pnpm check` (out of scope until it
  ships real endpoints).
