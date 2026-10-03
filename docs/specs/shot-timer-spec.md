# Shot timer — executable specification

> Old-coder SPEC artifact for the v3-backlog shot timer (`feat/shot-timer`,
> a maintainer-approved scope expansion).
> Absolute path: `/home/jimisola/cloud/dev/clones/jimisola/github/mobile-app/docs/specs/shot-timer-spec.md`
> Evidence report: `docs/specs/shot-timer-evidence.md`.
>
> **Approval status: NOT OBTAINED (autonomous run).** Same caveat as the M3
> spec: this document is written and implemented in the same session, so the
> correlation-breaking review the old-coder loop depends on did not happen.

Tier: **2** (a practice-utility timer, not scoring/compliance data — a wrong
cue is a bad practice rep, not silently wrong logbook data). Scope of the
old-coder loop: `shared/src/timer/` only. The app UI
(`app/src/app/timer.tsx`, `app/src/features/timer/`) is routine UI work per
CLAUDE.md and gets normal tests, not this loop.

## 0. Setup plan (what approving this authorizes)

- **Isolation:** branch `feat/shot-timer`, based on `feat/m7-release`, inside
  this agent's pre-existing worktree (has its own `pnpm i`'d
  `node_modules`).
- **Git:** Conventional Commits, every commit `-s` (DCO), explicit paths
  staged, branch pushed, no PR opened, `main` never touched.
- **New app runtime dependencies** (flagged per task instructions, none
  fixed by `docs/implementation-plan.md` §2 since the timer is a v3 item not
  yet in that table):
  - `expo-audio` (not `expo-av` — `expo-av` is deprecated as of the Expo SDK
    this app is on; `expo-audio` is the current SDK 57-supported audio API)
    for the start/stop/ready/complete beeps.
  - `expo-keep-awake` (already present as a **transitive** dependency of
    `expo`/`expo-router` per `pnpm-lock.yaml` before this branch — promoted
    here to a direct app dependency since the timer screen calls its API
    directly) to keep the screen awake while a drill is running.
  - `Vibration` from `react-native` core — no new dependency.
- **No new dev tooling** — reuses `vitest`, `@vitest/coverage-v8`, Stryker
  already wired for M3.
- **Files the gauntlet adds:** `docs/specs/shot-timer-spec.md` (this file),
  `docs/specs/shot-timer-evidence.md`; `vitest.config.ts` and
  `stryker.config.json` extended with `shared/src/timer/**/*.ts`.

## 1. Modules under specification

| Module                       | Responsibility                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| `shared/src/timer/types.ts`  | `TimerConfig`/`TimerPhase`/`TimerEvent`/`TimerCue` data shapes             |
| `shared/src/timer/engine.ts` | `TimerEngine` — the state machine (ready delay → series → rest → … → done) |

## 2. Presets (removed)

The PAR presets and the milsnabb drill (`presets.ts`) were removed once the
timer UI stopped offering them (#154); their tests went with them.

## 3. Engine state machine (negative constraints, each mapped to a test in EVIDENCE)

Phase sequence, per series `i` in `config.series` (0-based):

```
idle --start()--> readyDelay(0) --> series(0) --[more series?]--> rest(1) --> readyDelay(1) --> series(1) --> ... --> done
```

- **D1** `readyDelayMs`/`randomReadyDelay` is drawn **per series**, not once
  at the start of the whole drill — a shooter cannot anticipate the beep on
  rep 2+ of an interval drill either.
- **D2** `restMs` only applies _between_ series — never before series 0.
- **D3** The `rest` phase's `seriesIndex` is the series it is waiting to
  lead into (`i+1`), not the one that just finished — so a UI mid-rest can
  show "next: series 5" directly from `getPhase()`.
- **D4** Every series-start emits a `start` cue (`vibrate: true`); every
  series-end emits a `stop` cue (`vibrate: true`); the ready-delay phase's
  entry emits a `ready` cue (`vibrate: false` — a silent phase boundary, no
  audible/haptic cue by itself); the drill's very end additionally emits a
  `complete` cue after the last series' `stop`.
- **D5** `advance(deltaMs)` can cross **multiple** phase boundaries in one
  call (a host tick landing after a zero-length phase, or a test
  fast-forwarding past the whole drill) — events come back in strict
  chronological order.
- **D6** Time past `done` within the same `advance()` call is **dropped**,
  not carried into a next drill — `reset()` + `start()` is required to run
  again.
- **D7** `reset()` returns to `idle` from _any_ phase (including `done`) and
  zeroes `getElapsedMs()`; it emits no cue (a UI-driven cancel is not a
  drill event).
- **D8** Every `SeriesSpec.durationMs` must be `> 0` or `null` (validated in
  the constructor) — this is also what proves `advance()`'s phase-transition
  loop always terminates: even with `readyDelayMs`/`restMs` at 0, the finite
  `series` durations bound the number of phase crossings, and a `null` one is
  infinite, so it ends the loop rather than cycling it.
- **D10** A `null` duration runs the series open-ended: it ends only when the
  host calls `stopSeries()`, which emits the same `stop` cue and the same
  rest-or-done transition that its own time running out would (#346, which
  merged the IPSC-style shot timer into this engine). `stopSeries()` is a
  no-op in any other phase, so a stray tap cannot skip a ready delay or a
  rest.
- **D9** `TimerEngine` never imports from `react-native`/`expo` — the host
  (a React hook driving `setInterval`) owns the clock; the engine only ever
  sees deltas via `advance()`.

## 5. Testing standards (per CLAUDE.md §7 / M3 precedent)

- `pnpm coverage`: 100% lines/branches/functions/statements on
  `shared/src/timer/**/*.ts` (added to `vitest.config.ts`'s `coverage.include`).
- `pnpm mutation` (Stryker, `stryker.config.json` extended with
  `shared/src/timer/*.ts`): break threshold 95, same as M3.
- Audio/vibration/keep-awake **cannot be verified on the sandboxed emulator**
  (per task instructions) — the engine's unit tests assert the _data_ (cue
  events), and the app-layer hook's tests assert the expo-audio/Vibration/
  expo-keep-awake calls are _made_ (mocked), never that a real device plays
  a real sound. Flagged again as a maintainer smoke-test item in EVIDENCE.
