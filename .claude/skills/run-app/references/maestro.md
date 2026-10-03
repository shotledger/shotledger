# Maestro flows

Flows live in `app/e2e/`; run one with `maestro test e2e/<flow>.yaml` from
`app/`, against a dev build with Metro serving.

## Writing a flow

- **`openLink` right after `launchApp` races the bundle's linking listener**
  and silently does nothing. Wait first with a bounded, non-failing
  `extendedWaitUntil` on a nonexistent id (its `timeout` acts as a delay,
  since unlike `assertVisible` it does not fail), then retry once with
  `runFlow: {when: {notVisible: '<target>'}, commands: [openLink: ...]}`.
  `app/e2e/m5-stats.yaml` is the worked example.
- `extendedWaitUntil` does not scroll: wait for an element that stays on
  screen (e.g. `session-total`), or use `scrollUntilVisible`.
- After `inputText` near the bottom of a form the keyboard covers the next
  target: `pressKey: Back` closes it. Avoid `hideKeyboard` and
  `waitForAnimationToEnd`; both have hung indefinitely here.

## Running

- **Never edit the working tree while a flow runs.** Metro hot-reloads, the
  dev client returns to its initial route, and the flow fails on a screen
  that vanished.
- The software-rendered emulator is slow and uneven: single steps can take
  30 s+.
- On long flows (~25+ steps) the on-device driver can die with
  `DeviceServerDiedException … DEADLINE_EXCEEDED after 120s`. That is the
  emulator, not the flow.
- After killing a stuck `maestro` (`pkill -9`), or after the error above,
  the next run fails with `UNAVAILABLE` / "Command failed… closed". Run
  `adb kill-server && adb start-server` and retry; it may take more than one
  retry.
