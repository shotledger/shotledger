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

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-31 | Name: **ShotLedger** (~40 candidates collision-checked; runners-up in reserve: MarksmanLedger, MeanRadius, Groupline)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-31 | Open source — but **private repo initially**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-31 | Android first; iOS later — all code stays iOS-ready (cross-platform modules only, platform quirks behind small wrappers)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-31 | Stack: React Native + Expo + TypeScript; local SQLite as source of truth; Cloudflare (Workers + D1 + R2 + better-auth) for optional sync                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-31 | Free app; donations via Buy Me a Coffee (browser link, unlocks nothing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-31 | Scope: target shooting only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-01 | Dark theme reworked to "Purple Rain" (deep near-black purple ground, purple-tinted text/borders); gold accent proposed as default over lavender on WCAG AA margins, pending maintainer sign-off                                                                                                                                                                                                                                                                                                                                          |
| 2026-09-01 | **Accent resolved: lavender** (maintainer: "do not use yellow for buttons"). `Colors.dark.primary` is `#B98CFF`; the gold values stay in `app/src/theme/tokens.ts` as `PURPLE_RAIN_GOLD_ACCENT_REJECTED`, never assigned to an interactive token. Semantic colours (success/warning/danger) unchanged                                                                                                                                                                                                                                    |
| 2026-09-01 | **Scoring keys resolved** (maintainer): keypad is `1–9`, `0`, `10`, `X` — `10` is an ordinary ten, `X` is the centrumtia (`is_inner_ten=1`), same keys in integer and decimal modes. No `(X)` key; `is_inner_ten_decimal` deprecated (column kept, never written). Closes M3 spec VERIFY items V1 and V2; recorded as append-only amendments A1/A2 in `docs/specs/m3-scoring-spec.md` (A2 supersedes A1's labels)                                                                                                                        |
| 2026-09-01 | Sessions get `extra_rounds` (nullable, migration 0001): rounds fired but never scored. Counts toward the firearm round counter, ammo-lot usage and volume totals; excluded from every score statistic and from the series/shots structures                                                                                                                                                                                                                                                                                               |
| 2026-09-01 | Session detail header shows the per-series average and the X count; session lists show total · average/series · X count. The per-shot mean stays in the Stats toggle                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-09-01 | English discipline/program names use Title Case ("Military Rapid Fire"); Swedish keeps sentence case ("Militär snabbmatch"). Firearms tab is "Firearms & Ammo" / "Vapen & ammo"                                                                                                                                                                                                                                                                                                                                                          |
| 2026-09-01 | M6 compliance profile (§6.6): `shared/compliance` ships an `se` profile with **VERIFY placeholder** activity numbers (`windowMonths=6`, `requiredActivities=4`, `constants-se.ts`, `SE_VERIFIED=false`) — no FAP 551-3 numeric source text exists in this repo; barometer UI shows an explicit "unverified defaults" hint until the maintainer confirms. Settings' Compliance profile picker defaults to `se` when the device locale is `sv`, else `none` — **flagged for maintainer review**, a UX default not a confirmed product call |
| 2026-09-01 | M6 PDF export layout (club-log table + summary header, `shared/src/export/pdf-log.ts`) has **not** been checked against a real föreningsintyg attachment — VERIFY, per implementation-plan.md §4 M6                                                                                                                                                                                                                                                                                                                                      |
| 2026-09-01 | Stats "Custom" period picker uses `@react-native-community/datetimepicker` (ships with Expo SDK 57) — flagged for review since it wasn't in M2's original design-system component inventory                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-01 | M7 release prep: `android.package` set to `app.shotledger` (maintainer-vetoable, separate commit); app icon/splash are hand-rolled placeholder concentric-ring PNGs in the Purple Rain palette (no image tool available, zero new deps); store title _"ShotLedger — Target Shooting Log & Scoring"_ may overclaim vs. v1 (no photo scoring yet) — flagged with a v1-scoped alternative title in `docs/store-listing.md`, maintainer to pick                                                                                              |

**Open:**

- [ ] Personal vs organization Google Play account (org needs a legal entity + D-U-N-S number; skips the 12-testers-for-14-days gate; same $25 fee)
- [ ] Register `shotledger.app` (125 kr/yr at HostUp); optionally
      `shotledger.se` (99 kr/yr)
- [ ] License for the code when the repo goes public (lean: MIT/Apache-2.0
      vs. protective: AGPL)
- [ ] v2 scoring accuracy bar (TargetScan benchmark: validated 0.2–0.5 mm
      gauge accuracy; manual correction must be effortless regardless)
- [ ] Adopt reqstool for requirement↔test traceability at M1 (SHB/FAP
      rules as annotated requirements)? OpenSpec evaluated and deferred —
      plan.md + implementation-plan + ADRs cover its role for now

## Feature plan

### v1 — the logbook (Android)

- [ ] Fast score entry: per-shot keypad with dedicated `10` and `X`
      (centrumtia) keys, integer + decimal (10.9) scoring, 5/6/10-shot and
      custom series, running totals
- [ ] Disciplines — SPSF only in v1: precision + militär snabbmatch
      (+ generic ring-scoring for free training); vapengrupp + klass per
      SHB; märke/"guldserie" thresholds (age-adjusted). ISSF and
      fältskytte deferred to v2+
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
- [ ] Swedish targets first (Pistoltavla 25 m precision) alongside ISSF faces
- [ ] Group analytics: MPI (windage/elevation), mean radius, extreme spread,
      points-lost-to-group-size, session heatmaps
- [ ] WebShooter competition import (API behind webshooter-cli): placements,
      per-station scores, weapon classes, standard medals → logbook +
      FAP 551-3 barometer
- [ ] **ShotLog import** (decided 2026-09-02) — the maintainer uses ShotLog
      and will supply a real export in its native format; map it onto
      sessions/series/shots/firearms with the same selective, dedup-first
      flow as the WebShooter import (preview → choose → import, never
      blind). Spec + old-coder loop like `shared/csv/` since it writes
      logbook data. Blocked on the sample file.
- [ ] **Backup export/import** (decided 2026-09-02), two bundle kinds:
  - [ ] _Database only_ — the SQLite file (`VACUUM INTO` a consistent copy,
        never the live file), plus a manifest (app + schema version) so a
        restore can refuse a newer schema and migrate an older one.
  - [ ] _Database + all pictures_ — a single `.shotledger` zip: the same
        SQLite copy + every target/series photo, paths rewritten so restore
        is location-independent.
  - [ ] Restore = full replace with confirmation (and an automatic pre-restore
        backup), never merge; the vault (`feat/document-vault`) is excluded
        by design — it never leaves the device.
- [ ] **Export destinations** (feature list, to be prioritised): the OS share
      sheet (any app — already used by CSV/PDF; covers Google Drive, iCloud
      Drive, Nextcloud, mail, Signal… via their share targets, zero code);
      save to a user-chosen folder (Android SAF / iOS Files —
      `expo-file-system` + document picker); scheduled automatic backup to a
      chosen folder (daily/weekly, keep last N); direct Google Drive
      (Drive API + Google sign-in — only worth it for the scheduled case,
      since the share sheet already reaches Drive manually); our own cloud
      sync as the "just works" option once accounts exist. Order proposed:
      share sheet → chosen folder → scheduled → Drive API.
- [ ] Optional cloud sync (Cloudflare); photos to R2; share cards
- [ ] Encrypted on-device document vault (license, membership card) — never
      synced
- [ ] **Scan a physical license card** (decided 2026-09-02): when adding a
      license, offer "Scan card" next to manual entry — photograph the
      vapenlicens card, run on-device OCR, and pre-fill the license form
      (license number, firearm make/model/caliber, purpose, decided-on date,
      valid-until / "tills vidare", conditions, authority) for the user to
      confirm field by field; never save without confirmation. Field layout
      per the Polisen card (see the licenses table in
      `docs/implementation-plan.md` §3); other jurisdictions' cards are a
      per-profile template later. OCR must stay **on-device** (license data
      never leaves the phone) and cross-platform — candidate: ML Kit text
      recognition via a React Native wrapper (Android + iOS), new dependency
      → ask before adding. The scanned photo can optionally go straight into
      the vault. Reuse the perspective-correction step from photo scoring for
      angled shots of the card.
- [ ] iOS release (camera feature as the launch hook)

### v3+ — by user demand

- [ ] Timers — three kinds behind one "Timer" entry (decided 2026-09-02):
  - [ ] **Regular** — PAR/interval timer with ready delay, series, rest, and
        the milsnabb drill generated from the program definition
        (`feat/shot-timer`, `shared/src/timer/`, awaiting integration).
  - [ ] **Fälttimer** — range-officer command sequence for fältskjutning.
        Benchmark: [Fältskyttetimer](https://carlemil.github.io/FieldShootingTimer/)
        (open source, github.com/carlemil/FieldShootingTimer): spoken
        Swedish commands ("Tio sekunder kvar", "Färdiga", "Eld", "Eld
        upphör", "Patron ur, proppa vapen", "Visitation"), competition
        mode prefixing "Ladda!" / "Alla klara?" with the 60 s preparation
        countdown, pinch-adjustable fire time 5 s–5 min on a dial, partial
        splits (partider) as draggable flags on the dial ring with haptics at
        each, scrub a paused timer to any second or tap a command to jump
        to it, respects silent mode, keeps the screen awake, works
        offline. Command wording and timings come from SHB (kommandon
        section) — maintainer to clarify the exact feature set before
        implementation; the fältskjutning discipline itself stays out of
        the logbook (not a v1/v2 discipline), only the timer is in scope.
        Voice cues need per-language recordings or TTS (sv first, en).
  - [ ] **IPSC-style shot timer** — voice "Are you ready?" / "Standby",
        random-delay start beep, then split (lap) times detected from the
        sound of the shots via the microphone; shows first-shot time, splits,
        total, shot count; sensitivity setting; PAR-time optional. Needs
        expo-audio recording + on-device peak detection in
        `app/src/platform/` (new dependency — ask before adding); no
        recording is ever stored.
- [ ] Ammo performance comparison across lots
- [ ] Cross-session heatmaps, coaching hints
- [ ] GPS range auto-matching; Swedish range database
- [ ] Club/leaderboard features (only if a club asks)
- [ ] Watch app / widgets

## Architecture

**Local-first.** The device's SQLite database is the source of truth; the
app is fully functional with no account and no network. The cloud is an
optional backup/sync add-on (a Firebase replacement, inverted):

| Concern          | Choice                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | React Native + Expo, TypeScript                                                                                                              |
| Local DB         | SQLite (expo-sqlite — has web/WASM support, required by the agentic web loop) + Drizzle ORM                                                  |
| Migrations       | Drizzle Kit — schema in TS, versioned SQL migrations (Flyway-style journal), applied on-device at app start and to D1 via the same toolchain |
| Camera / CV (v2) | react-native-vision-camera + react-native-fast-opencv (JSI)                                                                                  |
| Sync API         | Cloudflare Workers (Hono), TypeScript shared types with the app                                                                              |
| Cloud DB         | Cloudflare D1                                                                                                                                |
| Photos           | Cloudflare R2 ($0 egress)                                                                                                                    |
| Auth (sync only) | better-auth on Workers/D1; Sign in with Apple + Google                                                                                       |
| Crash reporting  | Sentry (or none) — privacy-sensitive audience                                                                                                |

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

The whole lifecycle is designed so an agent can develop, run, _see_, and
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
- **Knowledge as project skills/references** so ANY developer's agent
  inherits the standards: `.claude/skills/spsf-domain/` (domain hard
  rules, auto-triggers on scoring/compliance work) →
  `docs/reference/spsf-shb-2026.md` (verified SHB facts, page-cited);
  `docs/adr/` (architecture decision records — never silently
  contradicted); CLAUDE.md (workflow + hard rules, auto-loaded).
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

## Repo configuration (github.com/jimisola/shotledger, private)

Modeled on the skillsgateway org. Applied via API (2026-09-01):
squash-merge only with `PR_TITLE` title + `COMMIT_MESSAGES` body (keeps
DCO trailers on main through squashes), delete-branch-on-merge,
allow-update-branch, web commit signoff required, wiki/projects off,
vulnerability alerts on, Dependabot security PRs off (Renovate owns
dependency updates). Renovate config: `renovate.json5` extends the
shared `github>skillsgateway/.github` preset; its labels
(bot-renovate*, renovate-version-*, security, dependencies) are created.
The old-coder evidence-first skill (vendored from AmazingAng/old-coder,
MIT — newer than skillsgateway's copy) governs scoring/compliance/CSV/
sync code; see CLAUDE.md.

**Manual steps for the maintainer:**

- [ ] Install the Renovate GitHub App on the repo:
      https://github.com/apps/renovate → Configure → select
      `jimisola/shotledger` (config is already in the repo)
- [ ] Nothing else is possible on a free-plan private repo: branch
      protection/rulesets and auto-merge are unavailable — merge
      discipline stays workflow-based until the repo is public/paid
- [ ] When the repo goes public: add a `protect-main` ruleset with
      required checks, enable auto-merge, revisit safe-settings, and
      audit history before flipping (per the secrets rule)

## Costs

| Item                                               | Cost           |
| -------------------------------------------------- | -------------- |
| Google Play account                                | $25 once       |
| Apple Developer Program (when iOS ships)           | $99/yr         |
| Cloudflare (to ~1–2k active users)                 | $0/mo          |
| Cloudflare Workers Paid (comfortable to ~5k users) | $5/mo          |
| Domains (shotledger.app, optionally .se)           | ~125–225 kr/yr |

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
