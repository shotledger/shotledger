# Release checklist

ShotLedger ships as an Android closed-testing build via EAS Build. No
Google Play developer account exists yet as of this writing — part (a)
below is one-time setup the maintainer has to do before the first upload.

## (a) One-time setup (maintainer only)

- [ ] **Google Play developer account.** VERIFY which account type
      (plan.md "Open" section, not yet decided):
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

- [ ] Create the real D1 database and R2 bucket and replace the
      placeholders in `backend/wrangler.jsonc`
      (`database_id: "local-dev-placeholder"`, `bucket_name:
    "shotledger-photos-dev"`). The committed values are deliberately
      unusable.
- [ ] `cd backend && wrangler d1 migrations apply <db> --remote` to apply
      `backend/migrations/` (sync, auth, photo schemas).
- [ ] `wrangler secret put BETTER_AUTH_SECRET` — **never** the
      `dev-placeholder-secret-never-use-in-production` value in
      `wrangler.jsonc`'s `vars`, which exists only so the local test suite
      can run. The real value lives under `~/agents/shotledger/`.
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
      email + password only.

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
