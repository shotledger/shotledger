# ShotLedger — agent instructions

Free, open-source (private for now) target-shooting logbook app.
React Native + Expo + TypeScript; local-first SQLite; optional Cloudflare
sync. Android first — **all code must stay iOS-compatible**.

## Read before working

- `app/PRODUCT.md` — what and why: users, positioning, operating
  context, capabilities/constraints, product principles. Update it in
  the same branch as a change that shifts one of these.
- `docs/architecture.md` — the tech-choice table and iOS-readiness
  rules, at a glance.
- `docs/decisions-log-archive.md` — the historical record of every
  narrower decision (a bug's root cause, a library pick, a wording
  call) that predates issue #138. Nothing here is open work; it
  replaced `plan.md`, which is retired.
- `docs/implementation-plan.md` — the execution spec: milestones,
  schema, screen inventory, per-task acceptance criteria. Follow it;
  do not improvise product decisions.
- `docs/reference/` — verified domain facts, one file per federation,
  each opening with links to that federation's rule books so a lookup
  never has to hunt for the PDF again:
  `spsf-shb-2026.md` (Svenska Pistolskytteförbundet, SHB upplaga 21),
  `issf-rules.md` (ISSF) and `svsf-rules.md` (Svenska
  Skyttesportförbundet). Every value carries a section/page citation;
  the source wins over the file. The `spsf-domain` skill summarizes the
  hard SPSF rules — it triggers on scoring/compliance work.
- `docs/adr/` — architecture decision records. Add one when changing an
  architectural decision; never silently contradict an accepted ADR.
- `.claude/skills/old-coder/` — evidence-first development loop (vendored
  from AmazingAng/old-coder, MIT). **Mandatory for changes to
  `shared/scoring/`, `shared/compliance/`, `shared/csv/`, and the sync
  engine** — the maintainer does not read that code line by line; the
  approved spec and evidence report are the review. Routine UI work uses
  normal tests instead.
- **Issue [#138](https://github.com/jimisola/shotledger/issues/138)** —
  the index of everything outstanding, and what replaced
  `docs/feedback-backlog.md`. Since 2026-09-20 it holds no items of its own:
  they live in ten grouped sub-issues, #346–#355, one per topic. Open #138
  (`gh issue view 138`) to find the group, then work in that child — tick its
  checkboxes in the same branch (`gh issue edit <n> --body-file …`) and note
  anything you decided or could not resolve as a comment on it. The
  closed-items log stays on #138.
- `docs/manual/` — the **user** manual, published with MkDocs. Written for
  shooters, not for contributors, and gated by `mkdocs build --strict`.
  See the documentation rule under Definition of done.
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
   the maintainer; never guess regulatory or scoring values. Look the
   value up first: the rule books are public and fetchable any time
   (SHB 2026: <https://www.pistolskytteforbundet.se/app/uploads/2026/01/SHB_2026_upplaga-21_NY.pdf>,
   and see the header of `docs/reference/spsf-shb-2026.md`). Ask only
   about what the book genuinely does not say.
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
8. **Pre-1.0.0, a version number buys nothing — change the format in
   place.** The app is unreleased and the maintainer is its only user, so
   no published format, schema or protocol earns a compatibility branch:
   `shotledger.sessions` stays `formatVersion: 1`, the sync protocol stays
   at its version, and a migration may rewrite existing rows rather than
   tolerate an older shape. Do not add a v2, a shim, or a "read both
   shapes" path for data only this machine has produced — it is dead code
   guarding a case that cannot occur, and it outlives the reason it was
   written. This governs **new** compatibility work; it is not a license
   to rip out tolerance that already ships. The rule ends at the first
   released build with users other than the maintainer, and whatever ADR
   declares that says so explicitly.
9. **English (US)** for identifiers, filenames, i18n keys and English
   strings and comments (`license`, `caliber`, `center`, `recognized`).
   Swedish strings in `sv.json` are unaffected, and so is Swedish prose in
   `docs/reference/` — a Swedish federation's rules are documented in
   Swedish.

   **Swedish descriptive terms are translated** (maintainer's ruling on
   #321 part 2, 2026-09-20): `guldserie` → `goldSeries`, `standardmedalj`
   → `standardMedal`, `märke` → `badge`, `valör` → `grade`, `vapengrupp`
   → `weaponGroup`. The earlier proposal to keep them Swedish as "terms of
   art" was **rejected** — do not reintroduce it.

   **One carve-out stands** (#321 part 3): a name keeps the spelling of
   the thing it names, so the app never contradicts the document or rule
   book it cites.
   - a federation's own official name for a discipline — `milsnabb`,
     `falt`/fältskjutning, ISSF's "25m Centre Fire Pistol". These have no
     English equivalent, and inventing one would misname the event (SPSF
     milsnabb is not ISSF Rapid Fire Pistol).
   - a document's field label: `vapenId`, from `VapenID` on the licence
     card.
   - **stored ids and column names** — `spsf-milsnabb`,
     `issf-centre-fire-pistol`, `official_standardmedalj`. Renaming these
     is a data migration, and the sync wire format is the column names, so
     both devices would have to agree. A Drizzle _property_ may be English
     over a Swedish _column_ — `officialStandardMedal` on
     `official_standardmedalj` is the intended shape, not an oversight.

## Definition of done

Code + tests written; `pnpm check` green; the relevant checkbox ticked
in `docs/implementation-plan.md` on the same branch; UI tasks include a
screenshot from the agentic loop.

**Documentation ships in the same PR as the change it describes.** A change
that alters what a user sees or does — a screen, a flow, a setting, a file
format, a limitation — SHALL update `docs/manual/` in the same pull request.
Not a follow-up, not an issue: the same PR.

The manual is built from the repo (`mkdocs build --strict`, gated in CI), so
documentation that lags the code is documentation that is wrong, and a user
reading it cannot tell which half to believe. The moment the change is made is
also the only moment its reasoning is fully in hand.

This covers `docs/manual/` — the user's manual. Contributor material
(`docs/adr/`, `docs/specs/`, `docs/implementation-plan.md`) keeps its own
existing rules above.

**Where a new paragraph goes** (the manual follows [Diátaxis](https://diataxis.fr/);
the directories are the quadrants, the nav deliberately does not name them):

| It answers                                                 | Directory            |
| ---------------------------------------------------------- | -------------------- |
| "walk me through my first session"                         | `getting-started.md` |
| "how do I do X" — steps, in order                          | `guides/`            |
| "what is X" — a lookup, values and tables                  | `reference/`         |
| "why is it like this" — a model, a limitation, a trade-off | `explanation/`       |

A page doing two of these is two pages. Explanation leaking into `guides/` is
the failure mode this exists to stop — see issue #309 for the migration, still
in progress.

## Agentic loop (verified at M0 scaffold — keep this section updated)

- Install: `pnpm i` (repo root; pnpm workspace covers `app/`, `shared/`,
  `backend/`). First install on a new machine also needs
  `pnpm approve-builds esbuild workerd` (native build scripts pnpm
  blocks by default — esbuild for bundling, workerd for
  `backend`'s Cloudflare Workers vitest pool). Also one-time per
  contributor after cloning (a security trust step, not a dependency
  install): `claude plugin install impeccable@pbakaus-impeccable` — the
  marketplace is already registered in `.claude/settings.json`, which
  enables the plugin for everyone once installed.
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
  no `shotledger://` scheme). On web it needs the page cross-origin
  isolated — the Metro dev server cannot send the COOP/COEP headers, so
  put a header-adding proxy in front (ADR 0012). `/dev` and
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
- **The three docs gates are NOT in `pnpm check`** — CI's _Build (strict)_ job
  runs them, so a docs change that passes `check` can still fail CI (it did, on
  #258). Run all three before pushing one:
  - `mkdocs build --strict` — links and nav.
  - `node scripts/docs-translation-check.mjs` — fails when a `.sv.md` page's
    last commit is older than its English source. An English-only edit with no
    Swedish counterpart to make therefore cannot pass it — that is a decision to
    take, not a gate to loosen.
  - `node scripts/docs-anchor-check.mjs` (`pnpm docs:anchors`) — fails on a link
    to a heading that no longer exists. `--strict` logs that at INFO and exits
    0, so it is invisible to the build (#343).

  They stay out of `pnpm check` because they need the Python toolchain
  (`pip install -r docs/requirements.txt`), which a code-only contributor has
  no reason to install.

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
- **Fast Refresh does not reload the i18n resources.** Adding an i18n key and
  saving renders the raw key path on screen (`compliance.criterionOtherFirearm`)
  even though the JSON is correct — `app/src/i18n` is read once at init. Force
  a cold start (`adb shell am force-stop` + relaunch) before concluding a new
  string is broken.
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
- **`expo run:android` builds for the connected device's ABI only.** With a
  phone attached it produces an `arm64-v8a`-only APK, which installs on the
  x86_64 emulator and then dies at startup with no Java stack trace — logcat
  shows only `failed to complete startup`. Check with
  `unzip -l …/app-debug.apk | grep -oE 'lib/[a-z0-9_-]+/' | sort -u` against
  `adb -s <serial> shell getprop ro.product.cpu.abi`. Rebuild for the other
  one with `cd app/android && ./gradlew assembleDebug
-PreactNativeArchitectures=x86_64` (~11 s incremental) and `adb install -r`.
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
- **An emulator's dev client talks to `10.0.2.2:<port>` — the HOST loopback —
  so `adb reverse` does not redirect it.** Pointing the emulator at a Metro on
  another port by remapping the reverse silently does nothing; the app keeps
  hitting whatever holds that port on the host. Either free the port and start
  your own Metro on it, or rebuild with `-PreactNativeDevServerPort=<port>`.
  `adb reverse` still matters for a USB-connected phone, which uses
  `localhost`.
- **A long-running Metro poisons its own resolution cache across a dependency
  bump.** A Metro left up over a zod upgrade served `Unable to resolve module
./schemas.js from .../zod/v4/classic/external.js` for a file that was
  present on disk, while a freshly started Metro returned the identical bundle
  URL at 200. `--clear` on the OLD process is not enough — start a new one, and
  confirm with `curl` against the exact bundle URL before blaming the
  dependency or reverting a merged bump.
- **`mkdocs serve` does not pick up a newly installed plugin**, so a language
  selector or nav change can be invisible in a server started before it.
  Restart it. And never `pkill -f "mkdocs serve"` — the pattern matches the
  shell running it and kills your own session; kill the PID, and list with
  `ps -eo pid,args | grep … | grep -v grep` for the same reason.
