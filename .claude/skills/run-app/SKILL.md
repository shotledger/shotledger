---
name: run-app
description: Launch, drive and screenshot the ShotLedger app — the web preview, the Android emulator with a dev build, Maestro e2e flows, or a standalone APK for a phone — and get past the Metro, emulator and APK problems this repo hits. Use whenever a UI change needs verifying in the running app, a PR needs a screenshot, an e2e flow needs running, a reported bug needs reproducing, or the app on the emulator does not match the source.
---

# Run and drive ShotLedger

Verify a UI change by navigating the running app, not by reading the source.
Read the code to find where to fix, then tap, swipe and screenshot to confirm
— several real findings only turned up this way (a "missing" auto-advance that
already worked, an orphaned empty series left behind when Add Series was
backed out of). Default to the **emulator**; use a physical phone only for
something hardware-dependent (camera, sensors, Bluetooth/USB).

Stop what you start: Metro, the emulator (`adb emu kill`) and the Gradle
daemon (`./gradlew --stop`). Never kill another session's.

## Pick a surface

| Need                                         | Surface       | Read                                 |
| -------------------------------------------- | ------------- | ------------------------------------ |
| Quick layout/copy iteration                  | Web preview   | below                                |
| Anything native, the DB, a real device check | Emulator      | `references/emulator.md`             |
| A repeatable e2e flow                        | Maestro       | `references/maestro.md`              |
| An APK to install on a phone                 | Release build | `references/emulator.md` (last part) |
| Screen does not match the source             | —             | `references/troubleshooting.md`      |

## Web preview

```bash
cd app && pnpm exec expo start --web --port <port>   # backgrounded
curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/   # poll for 200
```

View and screenshot with browser tooling; kill the server's PID when done.
The DB needs the page cross-origin isolated, which Metro cannot provide — see
`app/CLAUDE.md` (demo data).

## Driving the emulator

- Tap and swipe with `adb shell input tap <x> <y>` /
  `adb shell input swipe <x1> <y1> <x2> <y2> <ms>`; capture with
  `adb exec-out screencap -p > shot.png` and Read the PNG.
- **Scale every coordinate.** `input` uses the device's real pixels
  (`adb shell wm size`, e.g. 1080x2400), but a Read screenshot is usually
  shown downscaled with a factor ("displayed at 900x2000 … multiply by
  1.20"). Multiply before **every** tap — an unscaled tap still "succeeds"
  against whatever is there.
- Screenshot after every tap before reasoning about what happened: the tap
  may have hit the wrong control, or the screen may be mid-transition.
- Launch: `adb shell am start -a android.intent.action.VIEW -d "app://" app.shotledger`
  (Home) or `-d "app://dev"` (demo data). Avoid `monkey` once mid-flow: it
  injects a random touch first.
- Screenshots that leave the machine use `/dev` demo data, never real data.
