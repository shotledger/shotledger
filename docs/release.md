# Release checklist

ShotLedger ships as an Android closed-testing build via EAS Build. No
Google Play developer account exists yet as of this writing — part (a)
below is one-time setup the maintainer has to do before the first upload.

## (a) One-time setup (maintainer only)

- [ ] **Google Play developer account.** VERIFY which account type
      (tracked in issue [#354](https://github.com/jimisola/shotledger/issues/354), not yet decided):
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

- [ ] Create the real D1 database and R2 bucket, then replace the
      placeholder `database_id` and `bucket_name` in
      `backend/wrangler.jsonc`. The committed values are deliberately
      unusable.
- [ ] `cd backend && wrangler d1 migrations apply <db> --remote` to apply
      `backend/migrations/` (sync, auth, photo schemas).
- [ ] `wrangler secret put BETTER_AUTH_SECRET` — **never** the
      `dev-placeholder-secret-never-use-in-production` value in
      `wrangler.jsonc`'s `vars`, which exists only so the local test suite
      can run. The real value lives under `~/cloud/agents/secrets/shotledger/`.
- [ ] `wrangler deploy`, then point the app at it: set
      `expo.extra.apiBaseUrl` in `app/app.json` (or
      `EXPO_PUBLIC_API_BASE_URL` for a one-off build) to the deployed
      hostname. The default is the `https://api.shotledger.app`
      placeholder, which does not resolve.
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
      picks is saved.

## (b) Repeatable steps, every release

1. **Version bump.** Update `app/app.json`'s `expo.version` (semver).
   `eas.json` has `"appVersionSource": "local"`, so EAS reads the Android
   `versionCode` from local state and increments it automatically on
   each build — no manual versionCode bump needed.
2. **Changelog.** Add an entry (VERIFY: no `CHANGELOG.md` exists yet in
   this repo — start one, or use the Play Console release notes field
   directly, whichever the maintainer prefers).
3. **Build:**
   ```bash
   cd app && eas build --platform android --profile production
   ```
4. **Upload to Play Console closed testing:**
   ```bash
   cd app && eas submit --platform android --profile production
   ```
   (or upload the `.aab` manually in Play Console's closed-testing
   track — `eas submit` needs a Google Service Account key configured
   first; VERIFY that key's setup, it's part of (a) once decided).
5. **Verify in Play Console** that the build is processed and testers
   can install it (internal test link, or the closed-testing opt-in
   link).
6. **Promote to production** when ready: in Play Console, promote the
   tested release from the closed-testing track to production. VERIFY
   exact click-path (UI changes over time).

## Preview builds (internal testing, not Play Console)

```bash
cd app && eas build --platform android --profile preview
```

Produces an installable `.apk` for ad-hoc sharing (e.g. sideloading to a
test device) without going through Play Console at all. Useful for
milestone demos before a store submission is warranted.

## CI and build budget

**GitHub Actions**, private repo: macOS minutes are limited (2,000 min/mo
at a 10× multiplier ≈ 200 real minutes on the free plan) — the
unlimited-free-macOS perk only applies once the repo is public. EAS's
free tier (30 builds/mo, 15 iOS) covers app builds in the meantime.

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
- **Donations:** a "Support development" row in Settings opens the
  configured funding link in the external browser; unlocks nothing, no
  purchase language. Also linked from the store listing and README. The
  rail itself is under reconsideration — see `app/PRODUCT.md`'s Brand
  Commitments and issue #353.

## Repo configuration

`github.com/jimisola/shotledger`, private. Modeled on the skillsgateway
org, applied via API (2026-09-01): squash-merge only with `PR_TITLE`
title + `COMMIT_MESSAGES` body (keeps DCO trailers on `main` through
squashes), delete-branch-on-merge, allow-update-branch, web commit
signoff required, wiki/projects off, vulnerability alerts on, Dependabot
security PRs off (Renovate owns dependency updates instead). Renovate's
config (`renovate.json5`) extends the shared
`github>skillsgateway/.github` preset; its labels (`bot-renovate*`,
`renovate-version-*`, `security`, `dependencies`) are already created.
The Renovate GitHub App is installed.

**Blocked until the repo is public or on a paid plan:** branch
protection, rulesets and auto-merge are all unavailable on a free-plan
private repo (confirmed 2026-09-10: the rulesets API answers 403
"Upgrade to GitHub Pro or make this repository public") — merge
discipline stays workflow-based until then. Once the repo goes public,
add a `protect-main` ruleset with required checks, enable auto-merge,
revisit safe-settings, and **audit the full history before flipping
visibility** — the secrets rule in `~/.claude/CLAUDE.md` applies to
anything that was ever pushed, not just what is on `main` today.
