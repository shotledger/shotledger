# The app does not match the source

Work down the list; each step is more drastic than the one before.

1. **A new i18n string shows its raw key.** Fast Refresh does not reload the
   i18n resources: `adb shell am force-stop app.shotledger` and relaunch.
2. **The emulator talks to a different Metro than yours.** Logcat shows
   `ReactNativeJNI`/`BridgelessReact` connecting to another
   `10.0.2.2:<port>`, or UI that is in your bundle is missing. The installed
   APK was built for another port (often another worktree's). Rebuild with
   `-PreactNativeDevServerPort=<port>` — see `emulator.md`. A stale
   `debug_http_host` in the app's shared prefs can also override the port.
3. **Gradle says up to date and the install changes nothing.** When another
   worktree last installed onto the same AVD, `expo run:android` can skip
   repackaging, and `adb install -r` of the same APK does not help. Force
   it: `./gradlew assembleDebug --rerun-tasks -PreactNativeDevServerPort=<port>`,
   then `adb install -r` the APK yourself.
4. **The schema is old** (`table … has no column named …`) after a baseline
   regeneration: restart Metro with `--clear` and `pm clear` — see
   `app/CLAUDE.md`.
5. **Metro cannot resolve a file that exists** after a dependency bump
   (e.g. `Unable to resolve module ./schemas.js` inside zod). A long-running
   Metro poisons its resolution cache; `--clear` on the old process is not
   enough. Start a new Metro and `curl` the exact bundle URL before blaming
   the dependency.
6. **A screen still renders an older version** after any ANR (e.g.
   `System UI isn't responding`) or unexpected exit to the launcher, and
   nothing above helps. Stop debugging that install: `adb uninstall
app.shotledger`, then install fresh.
