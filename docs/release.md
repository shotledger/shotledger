# Release checklist

ShotLedger ships as an Android closed-testing build via EAS Build. No
Google Play developer account exists yet as of this writing — part (a)
below is one-time setup the maintainer has to do before the first upload.

## (a) One-time setup (maintainer only)

- [ ] **Google Play developer account.** VERIFY which account type
      (tracked in issue [#354](https://github.com/shotledger/shotledger/issues/354), not yet decided):
  - _Personal account_: $25 one-time fee. Play Console requires
    **12 testers opted into closed testing for 14 continuous days**
    before an app can go to production — this gate has to be planned
    into the timeline, not just the build.
  - _Organization account_: same $25 fee, but needs a legal entity and
    a D-U-N-S number (apply free at dnb.com, can take days to weeks to
    issue). In exchange it **skips** the 12-testers/14-days gate.
- [ ] Register the application id in Play Console: `app.shotledger`
      (set in `app/app.json` — see the commit that set it; this id is
      effectively permanent once a release is published under it).
- [ ] `npm install -g eas-cli` (or `npx eas-cli`), then `eas login` with
      the Expo account that will own this project.
- [ ] `cd app && eas build:configure` if EAS asks for a project id not
      already in `app/app.json` (`extra.eas.projectId`).
- [ ] First build: `cd app && eas build --platform android --profile
production`. Produces a signed `.aab`; EAS manages the upload
      keystore unless you supply your own.
- [ ] First upload: in Play Console, create the app entry, open the
      **Testing → Closed testing** track, create a track (e.g.
      "closed-alpha"), and upload the `.aab`. VERIFY exact click-path in
      Play Console's current UI — it changes over time; the doc here
      only fixes the concrete commands.
- [ ] Add the store listing content from `docs/store-listing.md`
      (English required; Swedish under Play Console's translation
      management) plus screenshots, icon, feature graphic (VERIFY: none
      produced yet — the hand-rolled placeholder icon in
      `app/assets/images/` is not store-launch quality).
- [ ] Complete Play Console's Data safety form and content rating
      questionnaire (VERIFY: not drafted here — depends on final feature
      set, e.g. whether sync/photos are enabled by the time of the first
      real submission).

### Cloud sync backend (maintainer only — an agent must never deploy)

Sync is opt-in and the app is fully functional without it, so these steps
are only needed before a build that should offer accounts. `wrangler
deploy` is forbidden to agents; every command below is the maintainer's.

One Worker serves both the sync API and the read-only web app (ADR 0013):
`wrangler deploy` uploads `web/dist` as its static assets. There are two
deployed environments in `backend/wrangler.jsonc`, `staging` and
`production`, each with its own D1 database and R2 bucket. The top level of
that file is local development and the test suite only, and Wrangler does
not inherit its `vars` or bindings into a named environment. No secret is
committed anywhere. Locally the Worker uses a built-in dev placeholder and
then answers only `localhost`, `127.0.0.1` and `[::1]`, so the top level
deployed by mistake serves nothing. A deployed env refuses to start (every
auth request answers `500`, logged as `AuthConfigError`) when
`BETTER_AUTH_SECRET` is missing, shorter than 32 characters or the dev
placeholder, or when `BETTER_AUTH_URL` is not an `https://` origin or is
still the `REPLACE_ME.invalid` placeholder. Try every step on `staging`
first; for production, repeat it with `production`.

What the deployed config already does:

- better-auth takes its base URL and its extra trusted origins
  (`BETTER_AUTH_TRUSTED_ORIGINS`, comma-separated; the app's `shotledger://`
  scheme is always trusted) from the env's `vars`.
- Its rate limiter is on, keyed by `CF-Connecting-IP` and stored in D1
  (`rate_limit`). Sign-in and sign-up allow 5 attempts per 60 seconds per
  address; listing and revoking sessions 10; other auth endpoints keep
  better-auth's defaults; paths that are
  not endpoints are not counted. A cron trigger every 15 minutes deletes
  rows whose window has passed.
- `workers_dev` and `preview_urls` are off, so only the custom domain
  serves the env.
- The web app's responses carry a Content Security Policy and the other
  security headers in `web/public/_headers`. The Worker's own routes send
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, and
  photos also a sandboxing CSP; photo uploads accept JPEG, PNG and WebP
  only.
- Logged errors carry their name and message, but a failed database
  query's bound parameters (`params: …`) are redacted, both in the
  Worker's error handler and in better-auth's logger.

- [ ] **Decide the hostname(s).** That decision is the maintainer's and is
      not recorded anywhere yet; nothing in the repo assumes one.
- [ ] **Decide whether the data stays in the EU.** D1 and R2 take a
      jurisdiction only when they are created; it cannot be added later.
- [ ] Run `pnpm cloudflare:setup staging <hostname>` from the repo root
      (add `--eu` for EU jurisdiction, `--dry-run` to see the changes
      first; needs `npx wrangler login`). `scripts/cloudflare-setup.mjs`
      does the next two steps: it creates the D1 database and R2 bucket,
      fills in the env's block of `backend/wrangler.jsonc` (and, for
      `production`, `apiBaseUrl` in `app/app.json`), generates
      `BETTER_AUTH_SECRET` into `~/cloud/agents/secrets/shotledger/` and
      uploads it. Running it again reuses what exists. Commit the config
      change on a branch; the ids are not secrets. To do it by hand
      instead:
- [ ] Create the env's D1 database and R2 bucket, then in its
      `env.<name>` block of `backend/wrangler.jsonc` replace the
      `REPLACE_ME` `database_id`, check the `bucket_name`, set
      `BETTER_AUTH_URL` to the env's origin (`https://<hostname>`), and
      uncomment its `routes` entry with the hostname. A deploy with a
      `REPLACE_ME` value left in fails.
- [ ] `cd backend && pnpm db:migrate:staging` to apply
      `backend/migrations/` to the env's D1 database (the script runs
      `wrangler d1 migrations apply` with `--remote --env staging`).
- [ ] `wrangler secret put BETTER_AUTH_SECRET --env staging`, typing the
      value at the prompt. The value lives under
      `~/cloud/agents/secrets/shotledger/`, one per env, at least 32
      characters (`openssl rand -base64 32`). Each env declares the
      secret in `secrets.required`, so a deploy without it stops. A secret
      put deploys at once, and creates the Worker if it does not exist yet.
- [ ] `cd backend && pnpm deploy:staging`. The script builds `web/dist`
      (`pnpm --filter @shotledger/web build`) and then runs
      `wrangler deploy --env staging`, so a stale web build cannot ship. There is
      deliberately no plain `deploy` script: the top level is not
      deployable.
- [ ] Smoke-test the env: the web app loads at `/` with no CSP errors in
      the browser console, sign-in works from the web and from a dev build
      of the app pointed at the env, and the sixth sign-in attempt within
      60 seconds from one address is refused with `429`.
- [ ] Point the app at production: set `expo.extra.apiBaseUrl` in
      `app/app.json` (or `EXPO_PUBLIC_API_BASE_URL` for a one-off build) to
      the production origin. The default is already
      `https://web.shotledger.app` (#887); check it resolves.
- [ ] Play Console **Data safety** form now has real answers to give: with
      sync enabled the app collects an email address and the logbook rows
      and photos the user chooses to sync, all deletable in-app via
      Settings → Account & sync → Delete account (`POST /account/delete`).
      Social sign-in is not offered — better-auth is configured for
      email + password only. **Location** needs an answer too: the app
      declares `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` for the
      session Location field's "Use my location" button. It is used, not
      collected — one foreground fix, taken only on that tap, sent to
      `overpass-api.de` to look up nearby ranges and then discarded; no
      background access, nothing stored, and only the range name the user
      picks is saved. **ML Kit** (licence-card OCR) counts as an SDK that
      collects data: the image and text stay on the phone, but Google's ML
      Kit terms say it sends Google metrics on the API's performance and use,
      and make the app responsible for disclosing that. Answer the form from
      Google's ML Kit data-disclosure guidance for the version shipped, and
      keep it consistent with the privacy policy
      (`docs/manual/reference/privacy-policy.md`).

## (b) Repeatable steps, every release

**The tag is the version.** Tags are bare three-part semver (`0.1.0`, never
`v0.1.0`). `app/package.json` holds a `0.0.0` placeholder, which Expo uses
because `app.json` sets no `version`; the release workflow stamps the real
version into it, uncommitted, right before `eas build`. The Android
`versionCode` (and later the iOS `buildNumber`) belong to EAS:
`"appVersionSource": "remote"` with `autoIncrement` on the `production`
profile. The workflow is modelled on revolve_now's and calls nothing outside
this repository: git-cliff from `.github/actions/setup-git-cliff` (pinned and
checksum-verified), `.github/actions/check-version`, and `.github/cliff.toml`.

One-time, before the first release:

- [x] The approval gate: the `release` environment requires the maintainer
      as reviewer, declared in shotledger/.github
      (`safe-settings/suborgs/product.yml`), not set by hand.
- [ ] The `EXPO_TOKEN` repository secret (see the iOS section).
- [ ] Run one production build interactively,
      `cd app && eas build --platform android --profile production`, so EAS
      creates the upload keystore; the workflow's non-interactive build
      cannot.

Every release:

0. **Deploy the sync server first, then update every phone** when the
   release adds, renames or drops a column of a synced table
   (`shared/src/sync/schema.ts`). The server refuses a row whose columns are
   not exactly its own, so whichever side runs the other schema has its
   changes to that table refused: a phone ahead of the server before the
   deploy, and a phone that has not updated after it
   (`docs/specs/sync-payload-validation-spec.md` C5, Q6). Deploying first
   only keeps the updated phones syncing; keep the gap to the phones short.
   The web app also refuses an edit of any row stored before the change
   until a phone pushes that row again with the new columns.
   The same holds for an EAS Update that carries a migration.
1. **Preview it.** Actions → _Release_ → Run workflow from `main`, with
   `dry-run` on (the default). It resolves the version from the
   Conventional Commits since the last tag (`feat:` bumps the minor, `fix:`
   the patch, a breaking change the minor while below 1.0.0) and writes the
   release notes to the job summary. Nothing is built or tagged. Commits
   missing from the notes were dropped as unconventional.
2. **Run it for real** with `dry-run` off. Leave `version` empty to take the
   auto-detected one; a different version needs `force`, and so does the
   **first** release if it is not `0.1.0`.
   - _prepare_ refuses a ref not on `main` (or `hotfix/*`, `release/*`), a
     commit already tagged, and a tag that exists.
   - _checks_ runs `ci.yml` on the same commit.
   - _build_ waits for approval, stamps the version, builds the Play bundle
     on EAS (`--wait`; the free tier's queue can be long), and refuses to
     continue unless EAS reports the stamped version and the same commit.
   - _publish_ pushes the tag and creates a **prerelease** with
     `shotledger-<version>.aab` and `SHA256SUMS.txt`; _verify_ downloads
     them back and checks the checksum; _promote_ marks it latest.
3. **Upload to Play Console closed testing:** the `.aab` from the release,
   or `cd app && eas submit --platform android --profile production`
   (`eas submit` needs a Google Service Account key configured first;
   VERIFY that key's setup, it's part of (a) once decided).
4. **Verify in Play Console** that the build is processed and testers
   can install it (internal test link, or the closed-testing opt-in
   link).
5. **Promote to production** when ready: in Play Console, promote the
   tested release from the closed-testing track to production. VERIFY
   exact click-path (UI changes over time).

## Over-the-air JS updates (EAS Update)

ADR 0020. A JS-only fix can reach installed EAS builds without a new
build. Anything that touches native code (a new or bumped native
dependency, `app.json` plugins or permissions) still needs a release.

One-time, before the first update:

- [ ] `cd app && eas project:info` prints the project id in
      `app/app.json` (`extra.eas.projectId`). `updates.url` is
      `https://u.expo.dev/<that id>`, already committed. If the id is not
      your project's, run `eas init` and fix both values together.
- [ ] `cd app && eas update:configure` should change nothing. If it
      writes to `app/app.json` or `app/eas.json`, review and commit that.
- [ ] Add `EXPO_TOKEN` to the `release` environment if the release
      workflow does not already have it there.
- [ ] Ship one release **after** `updates.url` landed. Builds made before
      it have no update URL and never check for updates.

Every update:

0. An update that carries a migration of a synced table waits for the
   sync server, and a phone that has not taken the update has its changes
   to that table refused, as step 0 of a release says.
1. Run the **EAS Update** workflow (`.github/workflows/eas-update.yml`,
   Actions → EAS Update → Run workflow). Dispatch it on a `hotfix/*` or
   `release/*` branch that contains the release's tag, with the release
   version as input. The runtime version is the app version, so the update
   has to be built from that release with that version stamped; the
   workflow refuses `main`, where the version is the `0.0.0` placeholder.
   It cannot run on the tag itself: the `release` environment deploys from
   protected branches only. To publish the tagged code as it is, push
   `release/<version>` at the tag first. Pick
   `preview` first to try it on a preview APK, then run it again with
   `production`. It runs the same checks as a release, then waits on the
   `release` environment.
2. Phones pick it up on the next launch after the download finishes, so
   expect it on the second launch.

By hand, the same thing is: check out the release or hotfix branch,
`cd app && npm pkg set version=<release version>` (don't commit it), then
`eas update --channel <preview|production> --platform android --message "<what changed>"`.

Locally built APKs (the `run-app` standalone APK) have no channel and never
receive updates.

## Preview builds (internal testing, not Play Console)

```bash
cd app && eas build --platform android --profile preview
```

Produces an installable `.apk` for ad-hoc sharing (e.g. sideloading to a
test device) without going through Play Console at all. Useful for
milestone demos before a store submission is warranted.

## CI and build budget

**GitHub Actions** standard runners, macOS included, are free for a public
repo. App builds run on EAS, whose free tier allows 30 builds a month, 15
of them iOS.

**iOS without a Mac.** EAS Build + EAS Submit run from Linux; TestFlight
handles beta distribution (builds expire after 90 days). A real iPhone is
still needed for camera testing — but no Mac is needed anywhere in the
pipeline.

## Supported Android versions and architectures

- **Android 7.0 (API level 24) and newer.** `minSdkVersion` 24 and
  `targetSdkVersion` 36 are the Expo SDK 57 template defaults, applied by
  `expo prebuild`; nothing in `app.json` overrides them. Raising the floor
  is a deliberate `expo-build-properties` change, not something a dependency
  bump should do silently — check `android/build.gradle` after a major Expo
  upgrade.
- **arm64-v8a and armeabi-v7a.** The Play AAB carries both ARM ABIs and Play
  serves the right one; x86/x86_64 exist only for the emulator. The direct
  APK on GitHub Releases is built arm64-v8a only
  (`-PreactNativeArchitectures=arm64-v8a`, 90 MB instead of 295 MB), so a
  32-bit phone must install from Play.

The same statement, in user words, is in `docs/store-listing.md`.

## Distribution channels

- **Android:** Google Play (main channel) + a direct APK via GitHub
  Releases. Google's developer verification requirement (enforcing
  2026-09-30 in BR/ID/SG/TH, global 2027) is satisfied by having a Play
  account — register the package name and signing key once.
- **F-Droid:** not for now (maintainer, 2026-10-20; #876). F-Droid refuses
  bundled proprietary libraries, and the build has three: ML Kit (licence-card
  OCR), Firebase Messaging (pulled in by `expo-notifications`) and Play
  Services Location (`expo-location`); EAS Update's OTA download breaks its
  policy too. Listing would need a free-only build flavour; #876 has the
  analysis. The GitHub Releases APK serves users without Play meanwhile.
- **Donations:** a "Support development" row in Settings opens the
  configured funding link in the external browser; unlocks nothing, no
  purchase language. Also linked from the store listing and README. The
  rail itself is under reconsideration — see `app/PRODUCT.md`'s Brand
  Commitments and issue #353.

## iOS (not shipped yet)

The iOS build is configured (`ios.bundleIdentifier` `app.shotledger`,
permission prompts in English and Swedish via `app/locales/sv.json`). The
first simulator build succeeded on 2026-10-05, but the app has not yet run
on a simulator or a device. There is no Mac in the loop: every iOS build
runs on EAS.

One-time setup (maintainer only):

- [ ] `cd app && eas init` to put the EAS project id in `app/app.json`
      (`extra.eas.projectId`), if the Android steps above have not already.
- [ ] Create an Expo access token and add it as the `EXPO_TOKEN` repository
      secret.
- [ ] For anything beyond the simulator (a device, TestFlight, the App
      Store): an Apple Developer Program membership, $99 a year. An
      individual account publishes under the holder's legal name.

Builds:

- **Simulator**, no Apple account needed: run the _iOS build_ workflow
  (Actions → iOS build → Run workflow), or
  `cd app && eas build --platform ios --profile simulator`. The EAS free
  tier allows 15 iOS builds a month on a low-priority queue, which is why
  the workflow is manual only.
- **Device and TestFlight** need the Apple account and an iOS section in
  the `preview` and `production` profiles of `app/eas.json`, added once the
  account exists.

Known risks:

- GoogleMLKit 8.0.0 compiled for the simulator in the first build, but
  nothing has exercised text recognition or OpenCV on iOS at runtime. It
  also bundles the Chinese, Devanagari, Japanese and Korean models, so
  expect a large app.
- `NATIVE_LICENSES` (`app/src/constants/native-licenses.ts`) has
  per-platform entries; the iOS ones come from that build's pod install.
  Re-check them when ML Kit or `react-native-fast-opencv` moves.
- App Store distribution of the AGPL app relies on the extra permission in
  `LICENSES/LicenseRef-ShotLedger-AGPL-Permissions.txt`, which requires the
  full source to be available outside the store. Publish the source before
  a public App Store release; TestFlight testing is not affected.

## Repo configuration

`github.com/shotledger/shotledger`, public since 2026-10-19. Modeled on the skillsgateway
org, applied via API (2026-09-01): squash-merge only with `PR_TITLE`
title + `COMMIT_MESSAGES` body (keeps DCO trailers on `main` through
squashes), delete-branch-on-merge, allow-update-branch, web commit
signoff required, wiki/projects off, vulnerability alerts on, Dependabot
security PRs off (Renovate owns dependency updates instead). Renovate's
config (`renovate.json5`) extends the shared
`github>skillsgateway/.github` preset; its labels (`bot-renovate*`,
`renovate-version-*`, `security`, `dependencies`) are already created.
The Renovate GitHub App is installed.

The repo moved from `jimisola/shotledger` to the `shotledger` organization
on 2026-10-14 (Free plan). Organization settings are declared in the
`shotledger/.github` repository and applied by the
`shotledger-safe-settings` app.

**In force since the repo went public** (declared in
`shotledger/.github`, `safe-settings/suborgs/product.yml`; checked against
`GET /repos/shotledger/shotledger/rules/branches/main` after the sync):

- `protect-main` on the default branch, `release/*` and `hotfix/*`:
  required checks `check` (GitHub Actions, 15368), `DCO` (DCO App, 1861) and `license/cla` (CLA Assistant,
  a commit status); "require branch up to date" off; one approval, given
  to Renovate's minor, patch and pin PRs by the `renovate-approve` App;
  stale approvals dismissed on push; every review thread resolved; no
  deletion or force-push. Organization admins may bypass; Renovate may
  not, because a bypass skips the checks too.
- `protect-tags`: tags cannot be deleted or moved.
- The `release` environment needs the maintainer's approval and deploys
  from protected branches only, so never from a tag.
- `allow_auto_merge` on, so Renovate merges through GitHub auto-merge
  once the ruleset is satisfied.
- A new job that runs on every PR is ungated until it is added to the
  required checks: change the workflow and `product.yml` in the same go.

**Going public** was issue #100, in this order:

1. **History audit.** Making the repo public publishes every commit
   reachable from a branch, a tag or a pull request (`refs/pull/*/head`),
   not only `main`. Done 2026-10-19 over all 2,217 such commits: no
   tokens, keys or private-key blocks; the only secret-like values are
   test fixtures; commit authors are the maintainer, Claude
   (`noreply@anthropic.com`) and Renovate; the only image outside
   `app/assets/` and `branding/` is the synthetic license card fixture;
   license numbers are synthetic (`A000.000/…`, `A123.456/…`). Re-run it
   right before the switch, for anything pushed since:
   `node scripts/history-audit.mjs` (fails on a finding; never prints a
   matched value).
2. **Licensing checks.** `reuse lint` runs in CI (`REUSE.toml`).
3. **CLA mechanism** live before the first outside pull request
   (`CONTRIBUTING.md`, "Signing the CLA"): the hosted CLA Assistant
   (<https://cla-assistant.io>), chosen 2026-10-19. Sign in there as the
   maintainer, put the text of `CLA.md` in a GitHub Gist (it lives at
   <https://gist.github.com/jimisola/9f7c846a410339a77b3a4346ea80b600>),
   and link the gist to the `shotledger` organization (done 2026-10-19 for
   every repo in the org). Allowlist bots (`renovate[bot]`, `*[bot]`).
   CLA Assistant checks each commit's author, so agent commits are
   authored and signed off as the maintainer, who has signed (decided
   2026-10-19; `CONTRIBUTING.md`, "AI-assisted commits"). When `CLA.md`
   changes, update the gist so contributors re-sign the new version.
4. **Make the repo public** (maintainer only).
5. **Then, in safe-settings:** the rules above (shotledger/.github#1,
   2026-10-19), and a required reviewer (the maintainer, self-review
   allowed) on the `release` environment (shotledger/.github#2,
   2026-10-20).
