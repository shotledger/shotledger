# ADR 0020: Over-the-air JS updates through EAS Update

Status: accepted (2026-10-13)

## Context

Every change, even a one-line JS fix, reaches a phone only through a new
EAS build and a Play Console upload. Issue #780 asked whether the app uses
EAS Update. It did not: no `expo-updates`, no `runtimeVersion`, no channels.

The restore flow's "close and reopen the app" prompt had been blamed on that
gap (ADR 0008). It turned out not to need `expo-updates` at all: `expo`'s own
`reloadAppAsync` reloads the JS in place, and #785 shipped that. So OTA
delivery is the only reason to add `expo-updates`.

## Decision

Maintainer's choice on #780, 2026-10-13: adopt EAS Update for OTA delivery of
JS-only changes.

1. **`expo-updates`** (`~57.0.26`, MIT), the version Expo SDK 57 pins. The
   app imports nothing from it. The restore reload keeps using
   `reloadAppAsync` (`app/src/platform/app-reload.ts`), which needs no update
   server.
2. **`runtimeVersion: { policy: "appVersion" }`** in `app/app.json`, the
   policy `eas update:configure` writes by default. The runtime is the
   release version that the release workflow stamps into `app/package.json`,
   so an update reaches only builds of that same release. Every release
   bumps the version, and every native change ships in a release, so a JS
   update can never land on a binary whose native code it doesn't match.
   `fingerprint` was rejected: by default it hashes the app config,
   stamped version included, so in this repo it gains nothing over
   `appVersion` and is harder to reason about.
3. **One channel per build profile** in `app/eas.json`: `preview` and
   `production`. `simulator` gets none, since it is for iOS compile checks.
4. **`updates.url`** is `https://u.expo.dev/<projectId>`, the value
   `eas update:configure` writes, with the project id already in
   `extra.eas.projectId`. (Amended 2026-10-19, #780: first left out until
   `eas init`; the id was already committed, so the URL followed.) Builds
   made before it run with `expo.modules.updates.ENABLED=false`.
5. **Publishing** goes through the EAS Update workflow
   (`.github/workflows/eas-update.yml`): dispatched on a
   `hotfix/*`/`release/*` branch, it stamps that release's version, runs
   the CI checks and publishes behind the `release` environment.
   (Amended 2026-10-20: no longer on a release tag, because the `release`
   environment now deploys from protected branches only.)
   `docs/release.md` has the steps.

## Consequences

- An update applies on the **next** launch after it downloads. Expo's
  defaults check on every launch and never wait for the download
  (`EXPO_UPDATES_LAUNCH_WAIT_MS` 0), so launch never waits on the network.
  That matches the offline-first principle (ADR 0001).
- A JS update must be published from a `hotfix/*` or `release/*` branch
  containing the release's tag, with the same version stamped. Publishing
  from `main` with the `0.0.0`
  placeholder targets runtime `0.0.0`, which no build has.
- Locally built APKs (`run-app`'s standalone APK) are not EAS builds and
  carry no channel, so they receive no updates.
- `expo-updates` adds native code: OkHttp (already in React Native),
  Bouncy Castle, Brotli and zstd on Android, and ReachabilitySwift and a
  vendored bspatch on iOS. The Android entries are in
  `app/src/constants/native-licenses.ts`. The iOS entries are added from
  the first iOS build that carries it.
- Remove it by deleting the dependency, `runtimeVersion` and the channels;
  nothing in the app's code depends on it.
