# ShotLedger — Project Plan

> Living document. Everything about the project is tracked here: decisions,
> feature plan, architecture, roadmap, and open questions. Update it in the
> same PR as the change it describes.

**ShotLedger** is a free, donation-funded mobile app for target shooters:
a shooting log (training + competition), camera-based paper-target scoring,
and Swedish license compliance (FAP 551-3) — offline-first, no account
required.

Store listing: **"ShotLedger — Target Shooting Log & Scoring"**.

## Positioning

No existing app combines all of:

1. Fast score logging (training and competition)
2. Camera-based target scoring — including Swedish SPSF precision/fält
   targets, which no photo-scoring app supports
3. FAP 551-3 activity logging (license barometer, PDF for license
   applications / föreningsintyg)
4. Cross-platform, free, offline-first, no forced account

Incumbents each do one slice: ShotLog (logging; buggy, resented paywall on
basics), TargetScan (photo scoring; stale, no logbook), Shotlytic (Swedish
compliance logbook; iOS-only, no photo scoring), LoggaSkott (license
barometer; no scoring), Skytteappen (club ecosystem).

**Non-negotiable product principles** (born from competitor complaints):

- Never gate series length, session type, firearm linking, or statistics.
  (ShotLog paywalls all four; its best users resent it.)
- Statistics are live, always-visible views — never a "generate report" form.
- The app is 100% functional offline with no account. Sync is opt-in.
- The user's data is theirs: local SQLite, CSV export always available.
- Target shooting only. No hunting, no tactical.

## Decisions log

| Date | Decision |
|------|----------|
| 2026-08-31 | Name: **ShotLedger** (~40 candidates collision-checked; runners-up in reserve: MarksmanLedger, MeanRadius, Groupline) |
| 2026-08-31 | Open source — but **private repo initially** |
| 2026-08-31 | Android first; iOS later — all code stays iOS-ready (cross-platform modules only, platform quirks behind small wrappers) |
| 2026-08-31 | Stack: React Native + Expo + TypeScript; local SQLite as source of truth; Cloudflare (Workers + D1 + R2 + better-auth) for optional sync |
| 2026-08-31 | Free app; donations via Buy Me a Coffee (browser link, unlocks nothing) |
| 2026-08-31 | Scope: target shooting only |

**Open:**

- [ ] Personal vs organization Google Play account (org needs a legal entity
      + D-U-N-S number; skips the 12-testers-for-14-days gate; same $25 fee)
- [ ] Register `shotledger.app` (125 kr/yr at HostUp); optionally
      `shotledger.se` (99 kr/yr)
- [ ] License for the code when the repo goes public (lean: MIT/Apache-2.0
      vs. protective: AGPL)
- [ ] v2 scoring accuracy bar (TargetScan benchmark: validated 0.2–0.5 mm
      gauge accuracy; manual correction must be effortless regardless)

## Feature plan

### v1 — the logbook (Android)

- [ ] Fast score entry: per-shot keypad with dedicated X/(X) keys, integer +
      decimal (10.9) scoring, 5/6/10-shot and custom series, running totals
- [ ] Disciplines: ISSF core (10m/25m/50m pistol & rifle) + SPSF precision,
      fält, military rapid; weapon classes A/B/C/Airgun; guldserie
      thresholds (age-adjusted)
- [ ] Sessions: training vs competition, tags, notes, target-photo
      attachment (photo only, no scoring yet)
- [ ] Firearms & ammo: inventory, per-class defaults, automatic round
      counter, maintenance intervals with reminders, license expiry
      reminders, ammo-lot tracking
- [ ] Statistics (live views): trends, per-firearm/per-ammo comparison,
      mean + standard deviation, best/worst, comparison vs last-N series
- [ ] FAP 551-3: rolling 6-month activity barometer per weapon, PDF export
      formatted for license applications / föreningsintyg
- [ ] CSV export/import
- [ ] Swedish + English; light/dark theme
- [ ] Local SQLite; schema carries `last_modified` + tombstones from day one
      so sync bolts on without migration

### v2 — the camera + sync

- [ ] Photo target scoring: detect target face, deskew angled photos,
      auto-detect holes, drag-to-correct always available
- [ ] Swedish targets first (SPSF C30 precision, fält) alongside ISSF faces
- [ ] Group analytics: MPI (windage/elevation), mean radius, extreme spread,
      points-lost-to-group-size, session heatmaps
- [ ] WebShooter competition import (API behind webshooter-cli): placements,
      per-station scores, weapon classes, standard medals → logbook +
      FAP 551-3 barometer
- [ ] Optional cloud sync (Cloudflare); photos to R2; share cards
- [ ] Encrypted on-device document vault (license, membership card) — never
      synced
- [ ] iOS release (camera feature as the launch hook)

### v3+ — by user demand

- [ ] PAR/interval shot timer
- [ ] Ammo performance comparison across lots
- [ ] Cross-session heatmaps, coaching hints
- [ ] GPS range auto-matching; Swedish range database
- [ ] Club/leaderboard features (only if a club asks)
- [ ] Watch app / widgets

## Architecture

**Local-first.** The device's SQLite database is the source of truth; the
app is fully functional with no account and no network. The cloud is an
optional backup/sync add-on (a Firebase replacement, inverted):

| Concern | Choice |
|---------|--------|
| App | React Native + Expo, TypeScript |
| Local DB | SQLite (expo-sqlite — has web/WASM support, required by the agentic web loop) + Drizzle ORM |
| Migrations | Drizzle Kit — schema in TS, versioned SQL migrations (Flyway-style journal), applied on-device at app start and to D1 via the same toolchain |
| Camera / CV (v2) | react-native-vision-camera + react-native-fast-opencv (JSI) |
| Sync API | Cloudflare Workers (Hono), TypeScript shared types with the app |
| Cloud DB | Cloudflare D1 |
| Photos | Cloudflare R2 ($0 egress) |
| Auth (sync only) | better-auth on Workers/D1; Sign in with Apple + Google |
| Crash reporting | Sentry (or none) — privacy-sensitive audience |

**Sync protocol** (opt-in): per-user changelog. Every row carries
`last_modified`; deletions are tombstones. Client pushes local changes,
pulls server changes since last sync; last-write-wins per row (safe: users
only edit their own data). No CRDT engine needed.

**iOS-readiness rules** (enforced from the first PR):

- Only cross-platform Expo/RN modules unless unavoidable; any
  platform-specific code goes behind a small wrapper module
- No Android-only UI assumptions (back button, FAB conventions are fine;
  hard-coded intents are not)
- CI keeps an iOS build target compiling even before iOS ships

## Agentic-first SDLC

The whole lifecycle is designed so an agent can develop, run, *see*, and
verify the app without a human in the loop:

- **Expo web target** (react-native-web): the app renders in a browser,
  where an agent can view, interact, screenshot, and iterate on UI/UX
  autonomously. This is the primary design loop; UI design/critique work
  uses the Impeccable skill against this target.
- **Android emulator + adb** (KVM confirmed on the dev machine): headless
  emulator, install APK, drive via adb/Maestro, pull screenshots — the
  fidelity check for real-device rendering and native behavior.
- **Maestro E2E flows**: YAML-defined, screenshot at each step, runnable by
  agents locally and in CI; every PR produces visual evidence.
- **Deterministic seed data**: a demo fixture (sessions, series, firearms,
  licenses) so every screen renders meaningful content for review.
- **CLAUDE.md** in the repo documents how an agent launches, seeds,
  screenshots, and tests the app — any session is self-sufficient.
- **Impeccable plugin, project-scoped**: `.claude/settings.json` registers
  the marketplace (github.com/pbakaus/impeccable) and enables the plugin
  for everyone. One-time per contributor after cloning (security trust
  step): `claude plugin install impeccable@pbakaus-impeccable`.

**Local builds (Linux):** daily dev via Expo dev server + hot reload onto
emulator or device; full local Android builds via `npx expo run:android`
(needs Android SDK + JDK 17/21 — pin per-project, system Java 25 is too new
for Android Gradle) or `eas build --local`. iOS can never build locally
(macOS required) — EAS cloud only.

## Build & distribution

- **CI:** GitHub Actions. Note: private repo ⇒ macOS minutes are limited
  (2 000 min/mo at 10× multiplier ≈ 200 real minutes on the free plan);
  the unlimited-free-macOS perk only applies once the repo is public.
  EAS free tier (30 builds/mo, 15 iOS) covers app builds meanwhile.
- **iOS without a Mac:** EAS Build + EAS Submit run from Linux; TestFlight
  for beta (builds expire after 90 days); a real iPhone needed for camera
  testing — no Mac needed anywhere.
- **Android distribution:** Google Play (main channel) + direct APK via
  GitHub Releases. Google developer verification (enforcing 2026-09-30 in
  BR/ID/SG/TH, global 2027) is satisfied by having a Play account —
  register the package name + signing key once.
- **Donations:** "Support development" in Settings opens Buy Me a Coffee in
  the external browser; unlocks nothing; no purchase language. Also linked
  from store listing + README.

## Costs

| Item | Cost |
|------|------|
| Google Play account | $25 once |
| Apple Developer Program (when iOS ships) | $99/yr |
| Cloudflare (to ~1–2k active users) | $0/mo |
| Cloudflare Workers Paid (comfortable to ~5k users) | $5/mo |
| Domains (shotledger.app, optionally .se) | ~125–225 kr/yr |

Donation target to break even: roughly 30–40 coffees/year.

## Implementation

The detailed execution spec — milestones M0–M7 with exact schema, screen
inventory, library decisions, formulas, per-task acceptance criteria, and
rules for implementing agents — lives in
[docs/implementation-plan.md](docs/implementation-plan.md). It is written
so non-frontier models can implement v1 task by task; anything requiring
judgment is marked `VERIFY:` and must be resolved with the maintainer.

## Roadmap / next steps

- [ ] Register shotledger.app
- [ ] Create private GitHub repo, push bootstrap
- [ ] Scaffold monorepo: `app/` (Expo), `backend/` (Workers), `shared/`
      (types, scoring logic)
- [ ] v1 SQLite schema: sessions, series, shots, firearms, ammo_lots,
      licenses, maintenance_log (+ `last_modified`/tombstones)
- [ ] Discipline/target definitions as data (JSON), not code — community
      can add disciplines via PR once public
- [ ] Screen map for v1 (benchmark: Shotlytic's tabs — Enter Score /
      History / Trends / Profile; ShotLog's X/(X) keypad)
- [ ] Install Android SDK + pinned JDK 17/21 on the dev machine; create
      KVM-accelerated emulator image
- [ ] CLAUDE.md: agent instructions for run/seed/screenshot/test loops
- [ ] Maestro setup + first smoke flow with screenshots
- [ ] GitHub Actions: lint + typecheck + test on PR; Android build
- [ ] Google Play account + closed testing track
