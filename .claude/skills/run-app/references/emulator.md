# Emulator and builds

## Toolchain

- SDK under `~/Android/Sdk` (platform 36, emulator). Env from `.envrc`
  (direnv), or export the same variables by hand.
- JDK 21 at `~/.sdkman/candidates/java/21.0.12-tem`. The system Java 25 does
  **not** work with Android Gradle.
- Package id is **`app.shotledger`** (from `app/app.json`), not the prebuild
  default `com.anonymous.app` — use it with `pm`, `am start` and `pm clear`.
- Maestro 2.10+ at `~/.maestro/bin/maestro` (see `maestro.md`).

## Boot

```bash
emulator -avd shotledger -no-window -no-audio -gpu swiftshader_indirect &
adb wait-for-device
adb shell getprop sys.boot_completed   # poll until 1 (~2 min)
```

Several AVDs exist (`emulator -list-avds`); with more than one running, pass
`-s <serial>` to every `adb` call. Map a serial to its AVD with
`adb -s <serial> emu avd name`.

## Dev build

`cd app && pnpm exec expo run:android` with the emulator already up. The
first run does an implicit `expo prebuild` (the gitignored `app/android/`),
downloads the NDK if missing and can take 10+ minutes; later builds reuse
the Gradle cache. Omit `--device`: it wants a picker name, not an adb serial.

Two ways it goes wrong:

- **It builds for the connected device's ABI only.** With a phone attached
  it produces an `arm64-v8a`-only APK, which installs on the x86_64 emulator
  and dies at startup (`failed to complete startup`, no stack trace). Check
  with `unzip -l …/app-debug.apk | grep -oE 'lib/[a-z0-9_-]+/' | sort -u`
  against `adb shell getprop ro.product.cpu.abi`, then rebuild with
  `cd app/android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64`.
- **It ignores `ANDROID_SERIAL`** and may install over another agent's build.
  Let it build, then install and launch by hand:

  ```bash
  adb -s <serial> install -r -d app/android/app/build/outputs/apk/debug/app-debug.apk
  adb -s <serial> shell am start -a android.intent.action.VIEW \
    -d "shotledger://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A<metro-port>"
  ```

Building the APK directly is often simpler and avoids both:

```bash
cd app && pnpm exec expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64 \
  -PreactNativeDevServerPort=<metro-port>
```

## Metro for a debug build

```bash
cd app && pnpm exec expo start --port <port> --dev-client   # backgrounded
curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/status   # poll for 200
```

**The emulator's dev client talks to `10.0.2.2:<port>`, the host loopback, so
`adb reverse` does not redirect it.** Either run Metro on the port the APK was
built for, or rebuild with `-PreactNativeDevServerPort=<port>`. `adb reverse`
matters only for a USB phone, which uses `localhost`.

## Standalone build for a phone

No Metro, no EAS account:

```bash
cd app && pnpm exec expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The template signs `release` with the debug keystore, so it installs with
`adb install -r` over another debug-signed build without losing data.
Restricting the ABI cuts a 295 MB universal APK to 90 MB. A release build
bundles JS at build time, so it fails at once on a bundling problem a dev
build would hit only when Metro serves. For demo data in a release build see
`EXPO_PUBLIC_ENABLE_DEV_TOOLS` in `app/CLAUDE.md` — never for a Play build.
