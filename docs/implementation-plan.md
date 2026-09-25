# ShotLedger — Implementation Plan (v1)

> Execution spec for implementing agents. [`plan.md`](../plan.md) says
> _what and why_; this document says _exactly how_. It is written so that
> an implementing agent can complete each task without product-level
> judgment. If a task is ambiguous or contradicts reality, STOP and ask —
> do not improvise product decisions.

## 0. Rules for implementing agents

1. **One milestone task = one branch = one merge.** Branch names:
   `feat/m1-schema`, `fix/…`, `docs/…`. Conventional Commits; every commit
   DCO-signed (`git commit -s`). Never commit to `main`; merges happen only
   after the maintainer's OK.
2. **Definition of done** for every task: code + tests written, `pnpm
check` (typecheck + lint + unit tests) green, the relevant checkbox in
   this file ticked in the same branch, and — for UI tasks — a screenshot
   produced via the agentic loop (§8) attached to the task summary.
3. **Never**: add dependencies not listed here without asking; change the
   DB schema without a Drizzle migration; commit secrets (they live under
   `~/cloud/agents/secrets/shotledger/`, outside the tree); remove or weaken a test to
   make it pass; implement features from later milestones early.
4. **Anything marked `VERIFY:`** is a fact that must be confirmed with the
   maintainer or an authoritative source before shipping the code that
   depends on it. Do not guess regulatory or scoring values.
5. All UI text goes through i18n from the first screen (§6.7). Swedish and
   English. No hard-coded strings in components.
6. All code iOS-compatible: no Android-only native modules; platform
   quirks behind wrappers in `app/src/platform/`.

## 1. Toolchain and repository layout

- Node ≥ 22, **pnpm** workspaces. JDK **21** (pinned via `.sdkmanrc` or
  `mise`; system Java 25 is incompatible with Android Gradle).
- Expo SDK: latest stable at scaffold time. Dev builds (not Expo Go).

```
/                     pnpm-workspace.yaml, tsconfig.base.json, .editorconfig
├── app/              Expo app (expo-router)
│   ├── app/          file-based routes (see §5)
│   ├── src/
│   │   ├── components/   design-system components (§5.1)
│   │   ├── db/           drizzle schema, migrations, queries, seed
│   │   ├── features/     one folder per feature (score-entry, firearms, …)
│   │   ├── i18n/         en.json, sv.json, index.ts
│   │   ├── platform/     platform-specific wrappers
│   │   └── theme/        tokens.ts (colors, spacing, type scale)
│   ├── e2e/          Maestro flows (*.yaml)
│   └── assets/
├── backend/          Cloudflare Workers (Hono) — v2, scaffold only in v1
│   └── src/
├── shared/           pure TS, no RN imports
│   └── src/
│       ├── scoring/      series math, guldserie, statistics (§6.4)
│       ├── disciplines/  discipline definitions + JSON schema (§6.2)
│       ├── compliance/   FAP 551-3 license-activity logic (§6.6)
│       └── csv/          export/import (§6.8)
├── docs/             this file, ADRs (docs/adr/NNN-title.md)
└── .github/workflows/ci.yml
```

- `shared/` is dependency-light and 100% unit-testable with **vitest**.
  The app tests use **jest-expo** only where RN APIs are involved; prefer
  putting logic in `shared/` so it's vitest-covered.
- Root scripts: `pnpm check` = `tsc -b && eslint . && vitest run &&
(cd app && jest --passWithNoTests)`.

## 2. Key library decisions (fixed — do not substitute)

| Purpose       | Library                                               | Note                                                                                               |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Navigation    | expo-router                                           | file-based; predictable for agents                                                                 |
| Local DB      | **expo-sqlite** + Drizzle ORM                         | expo-sqlite has web/WASM support — required by the agentic web loop. (op-sqlite rejected: no web.) |
| Migrations    | drizzle-kit                                           | SQL files in `app/src/db/migrations/`, bundled, run at app start via Drizzle's migrator            |
| IDs           | UUIDv7 (`uuidv7` pkg)                                 | sortable, sync-friendly                                                                            |
| State         | zustand (UI state only) + Drizzle live queries (data) | no Redux                                                                                           |
| Charts        | **react-native-svg** (hand-drawn)                     | victory-native/Skia was planned but never adopted — see plan.md 2026-09-03; do not add one         |
| Dates         | date-fns + date-fns-tz                                | store UTC ISO-8601 in DB; display local                                                            |
| Forms         | react-hook-form + zod                                 | zod schemas live next to features                                                                  |
| i18n          | i18next + react-i18next + expo-localization           |                                                                                                    |
| Notifications | expo-notifications (local only in v1)                 | license/maintenance reminders                                                                      |
| PDF           | expo-print (HTML → PDF)                               | FAP 551-3 export                                                                                   |
| E2E           | Maestro                                               | flows in `app/e2e/`                                                                                |

## 3. Database schema (v1 — write exactly this, as Drizzle tables)

Conventions: table names snake_case plural; every table has
`id TEXT PRIMARY KEY` (UUIDv7), `created_at TEXT NOT NULL`,
`updated_at TEXT NOT NULL` (both UTC ISO-8601), `deleted_at TEXT NULL`
(tombstone — **soft-delete everywhere**; queries always filter
`deleted_at IS NULL`). These three columns are the sync foundation; never
hard-delete rows.

```
firearms        make TEXT NOT NULL, model TEXT NOT NULL, caliber TEXT,
                weapon_type TEXT,              -- vapentyp: 'pistol'|'revolver'
                                               -- |'rifle'|'airgun'
                serial_number TEXT,            -- optional, sensitive
                vapen_id TEXT,                 -- national register id ("SE…"
                                               -- on the license card back)
                load_system TEXT,              -- laddsystem, e.g. halvautomat
                notes TEXT,
                round_count INTEGER NOT NULL DEFAULT 0,
                maintenance_interval_rounds INTEGER,   -- nullable
                rounds_since_maintenance INTEGER NOT NULL DEFAULT 0

licenses        firearm_id FK NOT NULL,        -- one row per ISSUED license;
                                               -- a renewal appends a new row,
                                               -- history is kept
                license_number TEXT,           -- e.g. 'A123.456/2024-01'
                purpose TEXT,                  -- ändamål, e.g. 'Målskjutning'
                decided_on TEXT,               -- datum för beslut
                valid_until TEXT,              -- giltighetstid t.o.m.;
                                               -- NULL = tills vidare
                conditions TEXT,               -- villkor (often empty)
                authority TEXT                 -- e.g. 'Polismyndigheten'
                -- expiry reminders (M4) key off the latest row per firearm
                -- vault_document_id was dropped by migration 0001 with the
                -- Vault itself (issue #276)

firearm_groups  firearm_id FK, group_id TEXT,  -- federation-scoped id, e.g.
                                               -- 'spsf:C' (§6.4a)
                is_default_for_group INTEGER NOT NULL DEFAULT 0

ammo_lots       label TEXT NOT NULL,           -- display name
                caliber TEXT, quantity INTEGER, purchased_on TEXT,
                is_handload INTEGER NOT NULL DEFAULT 0,
                -- factory ammo:
                brand TEXT, product TEXT, lot_number TEXT,
                -- projectile (factory and handload):
                bullet_make TEXT, bullet_model TEXT, bullet_weight_gr REAL,
                -- handload recipe:
                powder TEXT,                   -- e.g. 'Vihtavuori N320'
                powder_charge_gr REAL,         -- grains
                primer TEXT, brass TEXT,
                col_mm REAL,                   -- cartridge overall length
                crimp_mm REAL,
                notes TEXT

sessions        name TEXT NOT NULL,            -- default: program/discipline + date
                type TEXT NOT NULL CHECK(type IN ('training','competition')),
                kind TEXT NOT NULL DEFAULT 'series'
                                               -- CHECK(kind IN ('series','rounds'))
                                               -- what the session RECORDS,
                                               -- orthogonal to `type` and
                                               -- chosen at creation (maintainer
                                               -- ruling 2026-09-03): 'series'
                                               -- logs scored series, 'rounds'
                                               -- logs a fixed shot count in
                                               -- extra_rounds and never gets
                                               -- series. Immutable afterwards
                                               -- (migration 0006, 2026-09-03)
                discipline_id TEXT NOT NULL,   -- key into discipline defs (§6.2)
                program_id TEXT NULL,          -- predefined match format (§6.3);
                                               -- NULL = free-form training
                competition_level TEXT NULL,   -- only when type='competition';
                                               -- SHB 2026 C.3.1 (p. 52) levels:
                                               -- 'forening'|'krets'|'landsdel'
                                               -- |'national'|'riks'
                is_championship INTEGER NOT NULL DEFAULT 0,
                                               -- mästerskap is a flag ON a
                                               -- level (SHB C.3.1), not a
                                               -- level: KM=forening+1, SM=riks+1
                competition_name TEXT NULL,    -- e.g. "Skånemästerskapet"
                weapon_group TEXT,             -- the GUN: federation-scoped
                                               -- group id, e.g. 'spsf:C'
                                               -- (§6.4a); valid set depends on
                                               -- the discipline's federation
                shooter_class TEXT,            -- the SHOOTER (klass, §6.4a):
                                               -- 1|1u|1b|1s|2|3|Jun|Dam1|Dam2
                                               -- |Dam3|VetY|VetÄ
                firearm_id TEXT NULL FK,
                ammo_lot_id TEXT NULL FK,
                started_at TEXT NOT NULL,
                location TEXT, notes TEXT,
                decimal_scoring INTEGER NOT NULL DEFAULT 0,
                extra_rounds INTEGER NULL      -- rounds fired but never
                                               -- scored. Counts toward the
                                               -- firearm round counter,
                                               -- ammo-lot usage and volume
                                               -- totals; excluded from every
                                               -- score statistic and from the
                                               -- series/shots structures
                                               -- (migration 0001, 2026-09-01).
                                               -- On a kind='rounds' session
                                               -- this column IS the session's
                                               -- shot count.

series          session_id FK NOT NULL, position INTEGER NOT NULL, -- 1-based
                is_sighter INTEGER NOT NULL DEFAULT 0, -- provskott: excluded
                                               -- from score/stats, included
                                               -- in volume counts (§6.3);
                                               -- max ONE per section
                                               -- (main / final), UI-enforced
                is_final INTEGER NOT NULL DEFAULT 0,   -- series belongs to the
                                               -- final; a final may have its
                                               -- own sighters (both flags set)
                photo_uri TEXT NULL            -- local file URI

shots           series_id FK NOT NULL, position INTEGER NOT NULL,
                value_tenths INTEGER NOT NULL, -- 0–109. ONE storage for both
                                               -- modes: integer scoring stores
                                               -- value×10 (9 → 90), decimal
                                               -- stores tenths (10.3 → 103).
                                               -- Integer sums — no float drift
                is_inner_ten INTEGER NOT NULL DEFAULT 0,  -- centrumtia: the
                                               -- X key. A plain ten (the "10"
                                               -- key) leaves this 0.
                                               -- RESOLVED 2026-09-01 (spec
                                               -- amendments A1/A2)
                is_inner_ten_decimal INTEGER NOT NULL DEFAULT 0
                                               -- DEPRECATED 2026-09-01: the
                                               -- old "(X) in decimal mode"
                                               -- flag. Nothing writes it; kept
                                               -- rather than dropped because a
                                               -- destructive column-drop on an
                                               -- existing local-first DB is
                                               -- riskier than an unused column

maintenance_events firearm_id FK, performed_at TEXT NOT NULL,
                   kind TEXT NOT NULL,         -- free text v1
                   round_count_at INTEGER, notes TEXT

sight_settings  firearm_id FK NOT NULL,
                label TEXT NOT NULL,           -- free text; the same aiming
                                               -- method recurs per discipline
                                               -- with different clicks, and not
                                               -- every discipline is modeled,
                                               -- so no discipline FK (#114)
                elevation_clicks INTEGER,      -- signed, + = up; NULL = not set
                windage_clicks INTEGER,        -- signed, + = right
                                               -- both relative to whatever zero
                                               -- the shooter picked: only the
                                               -- DIFFERENCE between two rows
                                               -- means anything
                is_active INTEGER NOT NULL DEFAULT 0,  -- "aktuell inställning";
                                               -- ≤1 per firearm, query-enforced
                notes TEXT

tags            name TEXT NOT NULL UNIQUE
session_tags    session_id FK, tag_id FK, PRIMARY KEY(session_id, tag_id)

settings        key TEXT PRIMARY KEY, value TEXT NOT NULL  -- JSON values
```

Derived values (series totals, session totals, X counts, statistics) are
**computed, never stored** — implement in `shared/scoring/`.

Seed fixture (`app/src/db/seed.ts`, dev-only, invoked via a hidden dev
menu and by Maestro): 2 firearms (one AW93-like C-class .22lr with license
expiry ~18 months out, one airgun), 2 ammo lots, ~30 sessions spread over
6 months mixing training/competition and disciplines, realistic scores
(precision series 40–48), a few tags ("KM", "Tävling", "Träning").

## 4. Milestones and tasks

### M0 — scaffold (branch `feat/m0-scaffold`)

- [x] pnpm workspace + `create-expo-app` (TypeScript template) in `app/`,
      expo-router installed, dev build config (`expo prebuild` clean) —
      config present (expo-router + splash-screen plugins, `main:
expo-router/entry`); running `expo prebuild` itself is deferred
      with Android verification below (no Android SDK on this machine
      yet)
- [x] `shared/` package with vitest wired; `backend/` = `wrangler init`
      Hono hello-world only (not deployed)
- [x] tsconfig.base (strict true, noUncheckedIndexedAccess true), eslint
      (typescript-eslint + react-hooks + react-native), prettier
- [x] `.github/workflows/ci.yml`: on PR → pnpm check (see §1)
- [x] CLAUDE.md (repo root) per §8
- [x] Theme tokens file + light/dark via `useColorScheme`
- **Done when:** app boots on Android emulator AND `expo start --web`
  renders in a browser; CI file lints. **Android emulator boot is
  explicitly deferred** — no Android SDK/emulator installed on this
  machine yet (separate task); verified instead with `pnpm check` green
  and `expo start --web` serving a real react-native-web-rendered page
  (curl 200 + HTML body checked, server killed after).

### M1 — data layer (branch `feat/m1-schema`)

- [x] Drizzle schema exactly per §3; initial migration generated
- [x] Migrator runs at app start (blocking splash until done)
- [x] Seed fixture + dev menu toggle ("Load demo data" / "Wipe data")
- [x] Repository functions in `app/src/db/queries/` (typed, tested):
      createSession, addSeries, addShot, listSessions(filter), CRUD for
      firearms/ammo/tags; all writes set `updated_at`, deletes set
      `deleted_at`
- **Done when:** vitest/jest cover every query function; seed renders in a
  debug list screen. Native path verified end-to-end (migrator + queries +
  seed, 52 vitest tests against a real generated migration). Web: expo-sqlite's
  WASM/worker build fails to bundle under this Expo SDK's static web export
  (`Worker chunk not found for: .../expo-sqlite/web/worker.ts`); shipped
  native-first with a `client.web.ts`/`migration-gate.web.tsx` fallback (`db`
  is `null` on web) so `expo start --web` keeps booting — see M1 report for
  detail. Revisited in ADR 0012 (`web.output: "single"`, OPFS-backed
  connection on web). The `/dev` route itself isn't reachable in the web preview yet: the
  M0 root layout renders only `NativeTabs` (index/explore triggers), which
  has no host for non-tab routes — pre-existing scaffold gap, not new to M1;
  tracked for M2 (navigation shell).

### M2 — navigation shell + design system (branch `feat/m2-shell`)

Tabs (expo-router): **Home** `/`, **Statistics** `/stats`, **Firearms**
`/firearms`, **Settings** `/settings`. Session flow is modal-stacked:
`/session/new`, `/session/[id]`, `/session/[id]/series/[pos]`.

- [x] Design-system components in `app/src/components/`: Screen, Card,
      StatTile, Chip, SegmentedControl, ListRow, EmptyState, FAB,
      PrimaryButton, ScoreKeypad (M3). Each gets a story-like demo route
      under `/dev/components` (dev builds only) so agents can screenshot
      components in isolation.
      — ScoreKeypad deferred to M3 as noted; the rest are implemented and
      demonstrated on `/dev/components`, which (like `/dev`) is reachable
      only in dev builds (`dev/_layout.tsx` redirects to `/` otherwise).
- [x] Home: "Shots logged" total card, latest 10 sessions list (name,
      date, total, type chip), FAB "New session". Empty state with a
      friendly CTA when no data.
      — total shots is a live-enough Drizzle query re-run on screen focus
      (`useFocusEffect`, not a true reactive live-query — `client.ts` has
      `enableChangeListener: false`; wiring true live queries is left for
      when a screen actually needs push updates, e.g. M3 score entry).
      Session total = `sumValueTenths` (shared/scoring/totals.ts) over
      `listScoredShotsForSession` (excludes sighter-series shots per
      §6.3), ÷10.
- [x] Settings: language (system/sv/en), theme (system/light/dark),
      "Load demo data" (dev), placeholder "Support development" row.
      — both settings persist to the `settings` table (new
      `app/src/db/queries/settings.ts`, JSON-encoded values, upsert via
      `onConflictDoUpdate`) and are also applied to i18next / the theme
      hook live via `state/app-settings.tsx`.
- **Done when:** Maestro flow `app/e2e/m2-smoke.yaml` walks all tabs on
  seeded data, screenshots each; web target renders all tabs.
  — both verified. Web: browser screenshots of all 4 tabs, `/dev`,
  `/dev/components`, `/session/new`, sv language switch, light theme.
  Emulator: `expo run:android` dev build on the `shotledger` AVD (first
  build 8m12s — downloaded the NDK + Build-Tools 36, none of which were
  cached on this machine), then `maestro test app/e2e/m2-smoke.yaml`
  passed against seeded demo data (screenshots under M2 report). One
  flow gotcha worth keeping: right after `launchApp`, `openLink` can
  race the JS bundle's linking listener and silently no-op, so the flow
  waits for `Home` to be visible before opening `app://dev`.

### M3 — score entry (branch `feat/m3-score-entry`) — the core UX

New-session form: type (training/competition — both free); discipline
picker (§6.2); **program picker** (§6.3 — filtered by discipline;
"Free training" option = no program); for competitions: competition level
(level + mästerskap flag, §3) + optional competition name;
weapon group + shooter class (§6.4a; groups filtered by discipline);
firearm (defaults to the group default);
ammo lot; decimal toggle (only if discipline allows and no program forces
it). Name defaults to `<level> <program> <general class>` for
competitions, `<discipline> — <local date>` for training.

**Series flow (never a fixed count):** series are added one at a time.
When the session's program `supportsFinal`, a **"Start final" action**
appears after at least one scored series — series added after it get
`is_final=1` and the session detail shows a Final section divider plus
three results: Before final · Final · Total (§6.3). Each section allows
at most one sighter. (Amended in `fix/session-detail-ui`, 2026-09-03: the
sighter choice moved off the add-series area and onto the series entry
screen itself, next to Save — see the plan.md decisions log entry for
that date. It still enforces one sighter per section, and a series that
already is the sighter can un-set itself.)

**ScoreKeypad spec** (get this exactly right):

- Keys: `1–9`, `0`, `10`, `X`, backspace — **the same list in both modes**
  (resolved by the maintainer 2026-09-01; spec amendments A1 and A2, the
  latter superseding the former). Integer mode: tap = one shot; `10` ⇒ value
  10 with `is_inner_ten=0`, `X` ⇒ value 10 with `is_inner_ten=1` (centrumtia),
  `0` ⇒ a miss. Decimal mode: two taps per shot — `"10"` then `"9"` ⇒ 10.9
  with no flag; `X` then `"9"` ⇒ 10.9 + `is_inner_ten`; `0` then `0` ⇒ a
  decimal miss. There is no `(X)` key, and `is_inner_ten_decimal` is
  deprecated (§3). Statistics that count "X" count innertior.
- Session kind (§3 `sessions.kind`, 2026-09-03): the new-session form asks
  up front whether the session logs **scored series** or a **fixed number of
  rounds**, and adapts — a `'rounds'` session collects a shot count (stored in
  `extra_rounds`) and is offered no program, no decimal toggle and no series;
  a `'series'` session is never offered `extra_rounds` at creation. Field
  order: Type → Logging → Session name (auto-derived, overridable) → Location
  → discipline/program → competition details → vapengrupp/klass (SPSF) or
  event (ISSF/SvSF) → firearm/ammo
  → shot count (rounds only) → tags.
- Extra rounds: the session form and session detail carry an
  `extra_rounds` field for rounds fired but not scored — volume only
  (round counter, ammo-lot usage, shots-logged totals), never score.
- Shot chips fill left→right for the series length defined by the
  discipline (5/6/10 or custom); running series total always visible;
  editing a chip re-selects it, keypad overwrites.
- Series saved ⇒ append next empty series automatically; session total
  updates live. Guldserie: when discipline+class has a threshold (§6.5)
  show "Guld vid N poäng" and a badge when reached.
- [x] Keypad component + logic in `shared/scoring/entry.ts` (pure,
      vitest-tested: all key sequences, both modes, edit flows)
      — built under the old-coder loop (CLAUDE.md makes it mandatory for
      `shared/scoring/`): executable spec in `docs/specs/m3-scoring-spec.md`,
      evidence in `docs/specs/m3-scoring-evidence.md`. The spec was **not
      approved by the maintainer before implementation** (autonomous run) —
      it is the artifact to review after the fact. Its two VERIFY items — the
      `(X)` semantics (V1) and which key types "10" in decimal mode (V2) —
      were **RESOLVED by the maintainer on 2026-09-01** and are recorded in
      the spec's append-only amendments A1 and A2 (A2 supersedes A1's key
      labels; the data model is `is_inner_ten` = centrumtia in both).
- [x] Session detail screen: Series list (chips per shot, per-series
      totals) / Stats toggle (M5 fills stats)
      — series list, Before final / Final / Total results (§6.3), guldserie
      badge + "Guld vid N" (§6.5, hidden when the vapengrupp has no märke row
      or the birth year is unknown — new `birthYear` setting on /settings).
      The Stats toggle itself is left to M5, which fills it.
      Amended in `fix/session-detail-ui` (2026-09-03, maintainer-requested
      polish batch — see plan.md decisions log): the results card
      (Total/Before final/Final, avg/series, X count) is now a single
      compact row roughly a button's height, the session-level
      "Guld vid N p" line is dropped (the per-series hint on the series
      entry screen stays), the standalone Share button moved off this
      screen onto the new `session/[id]/edit.tsx` metadata screen (reached
      via a header Edit action) and onto the sessions list, and each series
      row gets swipe-to-delete (`react-native-gesture-handler`
      `ReanimatedSwipeable`, confirm dialog, soft-deletes its shots and
      backs out the deleted shot count from the linked firearm's round
      counters — `deleteSeriesAndShots` in
      `app/src/db/queries/round-count.ts`; disabled for a fixed-format
      program's pre-created skeleton, since removing one series would
      leave the structure incomplete). Series positions are intentionally
      left with gaps after a delete rather than renumbered, since position
      indexes a fixed-format program's skeleton (`timeLimitSeconds`).
- [x] Attach photo to series (expo-image-picker; camera or library) —
      free, stored as local URI
      — library picker via `app/src/features/session/pick-photo.ts`; the
      camera path is the same API and ships when the firearms/maintenance
      screens need it (M4).
- Also in this branch: the new-session form (§4 M3), discipline/program
  data files with zod schemas (§6.2/§6.3), federation-scoped vapengrupper
  and klasser (§6.4a), and the milsnabb fixed-format skeleton.
- **Done when:** Maestro flow enters a full 5-series C-precision session
  by tapping and asserts the computed total; unit tests cover scoring
  edge cases (0, miss, X in both modes).
  — `app/e2e/m3-entry.yaml` does exactly that on the `shotledger` AVD dev
  build; since the 2026-09-01 amendments each series is `9,9,9,10,X`, so the
  flow exercises both ten keys and asserts the total (235), the per-series
  average (47.0) and the X count (5). Unit tests:
  187 vitest tests total, 100% line/branch/function coverage on the shared
  scoring + discipline modules, Stryker 98.26% (7 survivors, all classified
  equivalent in the evidence report) plus a persisted on-disk mutation
  runner for the zod schemas (17/17 killed).

### M4 — firearms, ammo, compliance data (branch `feat/m4-gear`)

- [x] Firearms CRUD screens; weapon groups per firearm; per-group default;
      round counter auto-incremented by session save (all shots including
      sighters; only firearm-linked sessions); manual adjust with reason
- [x] Maintenance: log event, interval setting, "rounds since" indicator
      (green/amber/red at 80%/100%), local notification at 100%
- [x] License register per firearm (licenses table §3 — number, purpose,
      decision date, validity, conditions; renewals append, history
      kept); local notifications at 90/30/7 days before valid_until
      (VERIFY preferred lead times with maintainer)
- [x] Ammo lots CRUD incl. handload recipe fields (powder, charge,
      bullet, primer, brass, COL); session links lot; per-lot usage
      count; lot-vs-lot comparison stays v3
- **Done when:** Maestro covers create-firearm → session → round count
  incremented → maintenance amber; notifications verified by unit-testing
  the scheduling function (not the OS delivery).
  — `app/e2e/m4-gear.yaml` implements exactly that flow. Unit/query-layer
  coverage: 223 vitest tests total (up from 187), including
  `shared/src/firearms/*.test.ts` (maintenance-status, license-status,
  notification-schedule — the pure scheduling logic) and new
  `app/src/db/queries/{maintenance-events,round-count,ammo-usage}.test.ts`,
  the last proving end-to-end that `saveSeriesShots` increments a
  firearm-linked session's round counter for every shot including
  sighters, and only for firearm-linked sessions. On the `shotledger` AVD
  dev build the flow was verified in stages across multiple runs — create
  firearm, round count starts at 0, weapon-type picker, maintenance
  interval save, and opening the license "Add renewal" form all pass
  (screenshots `m4-01-new-firearm.png`, `m4-02-firearm-detail.png`) — but
  a single clean end-to-end pass could not be captured in this session:
  the on-device `maestro-driver` gRPC connection reproducibly died
  (`DeviceServerDiedException: DEADLINE_EXCEEDED after 120s`) on the
  `license-number` field's `inputText` step specifically, across a fresh
  emulator boot and independent of the input's content — see the CLAUDE.md
  Maestro-gotchas note. Re-running `maestro test e2e/m4-gear.yaml` on a
  less resource-constrained host (or a physical device) is the suggested
  next step to get the clean pass.

### M5 — statistics (branch `feat/m5-stats`) — live views, never a form

All math in `shared/scoring/stats.ts` (vitest): sighter series are
excluded from every score metric but included in volume metrics (total
shots, rounds fired) — amended 2026-09-16, see the sighter-semantics note
below: the Statistics tab counts them unless the user filters them out. Series mean, session mean
per shot, standard deviation (sample), best/worst series, X counts
(= innertior, `is_inner_ten`; labelled "X" / sv "innertior"),
rolling trend (per-session mean over time), comparison of last N series
vs previous N (default N=100), guldserie count per period, per-firearm
and per-ammo-lot aggregates.

- [x] Stats tab: period filter (30d/6m/12m/all — segmented, default 6m),
      discipline + class + firearm filter chips; StatTile grid (total
      shots, sessions, mean, SD, X%, guldserie count); trend line chart;
      shot-value distribution bar chart
      — `app/src/app/(tabs)/stats.tsx`, live view fed by
      `app/src/features/stats/use-stats-data.ts`, no generate button;
      empty state both for no data at all and for no data in the current
      filter.
- [x] Session detail Stats toggle: totals, mean, SD, X count (innertior),
      distribution mini-chart, comparison vs the user's last 100 series
      of the same discipline/class
      — segmented Series/Stats toggle in `app/src/app/session/[id]/index.tsx`;
      `app/src/features/session/use-session-stats.ts` adds the
      standardmedalj line (§6.5b, evaluates beforeFinal) on top of the
      shared M5 stats engine. Amended in `fix/session-detail-ui`
      (2026-09-03): the per-shot row (mean/SD/X) sits alongside a second
      "whole session" row (total points, total shots) so both readings
      are visible together; the tile grid also switched to a single-line,
      ellipsis-truncated label to stop long Swedish labels
      (e.g. "Standardavvikelse") from wrapping character-by-character in
      a 3-up row.
- **Done when:** stats screens render from seed deterministically
  (Maestro screenshot compares stable numbers), formulas unit-tested
  against hand-computed fixtures.
  — both verified. Math: `shared/src/scoring/stats.ts` (series/session
  mean, sample SD, best/worst series, X counts/rate, rolling per-session
  trend, last-N-vs-previous-N series comparison, guldserie count,
  per-firearm/per-ammo-lot aggregates) and the new
  `shared/src/scoring/standardmedalj.ts` (§6.5b thresholds, >10-series
  scaling, evaluates beforeFinal) were built under the old-coder loop
  (CLAUDE.md mandates it for `shared/scoring/`): executable spec in
  `docs/specs/m5-stats-spec.md` (spec approval: not obtained, autonomous
  run), evidence in `docs/specs/m5-stats-evidence.md`. 273 vitest tests
  total (up from 223), 100% line/branch/function/statement coverage on
  `shared/src/scoring/**`, Stryker 98.15% (4 new survivors, all classified
  equivalent mutants in the evidence report). Chart library: the plan's
  victory-native pulls in `@shopify/react-native-skia` (a native module
  needing a full prebuild/rebuild) purely for two simple charts — shipped
  `react-native-svg` instead, a single lightweight dependency with solid
  `react-native-web` support and no native-rebuild peer chain (documented
  deviation). Maestro: `app/e2e/m5-stats.yaml` on the `shotledger` AVD dev
  build passed end-to-end (screenshots `m5-01-stats-default`,
  `m5-02-stats-all-time`, `m5-03-session-stats`) — deterministic seed
  numbers (1040 shots / 30 sessions / mean 8.0 / SD 1.43 / X% 7 / 7 gold
  series on the default 6-month filter). The flow avoids `inputText`
  entirely (navigation + assertions on visible numbers only, per the
  CLAUDE.md Maestro gotchas note) and adds a bounded non-failing settle
  wait plus a one-shot `openLink` retry for the known launchApp/openLink
  race noted in the M2 report, which otherwise made the flow's `app://dev`
  step flaky on this sandboxed emulator.

### M6 — FAP 551-3 license activity + PDF (branch `feat/m6-compliance`)

Logic in `shared/compliance/` driven by a config object, not hard-coded:
`{windowMonths: 6, requiredActivities: N, countsAs: …}` per weapon group.
Two authoritative sources, kept separate in the config: (a) **FAP 551-3**
numeric activity requirements — **settled 2026-09-16** against PM 551.24
page 3 (5 kap 5–6 §§); see `docs/specs/compliance-fap551-spec.md` and the
checklist item below. The Skjuthandbok itself contains no numeric counts.
(b) **SHB Bilaga 8** (p. 484, verified) club-intyg rules
worth surfacing as indicators: ≥6 months active membership before first
intyg (first weapon .22), grovkaliber earliest after 12 months,
pistolskyttekort held, and pistolskyttemärke guld — or årtalsmärke within
the last two years — fulfilled (the app can compute märke fulfillment
from §6.5 automatically).

- [x] License Activity UI on Home + per firearm: activities in rolling window vs
      required, green/amber/red
      — Home shows one overall chip (`compliance.licenseActivity{Green,Amber,Red}`,
      worst-of across every weapon group the shooter's firearms hold);
      Firearms tab and firearm detail show per-firearm chip(s), worst-of
      across the firearm's own weapon groups. All hidden when the resolved
      profile is `null` (`'none'`), per §6.6. Settings gained a Compliance
      section: profile picker `none`/`se`, defaulting to `se` when the
      device locale is `sv` else `none` (`resolveDefaultProfileSelection`,
      **flagged for maintainer review** — a UX default, not a confirmed
      product decision) — a stored `settings.complianceProfile` row always
      overrides the default once set.
- [x] PDF export (expo-print): shooting log for a chosen period/firearm —
      layout: the five columns of the preprinted "Personlig skyttelogg" book
      (Datum, Plats, Skytteaktivitet, Använt vapen, Uppg. styrkta av) +
      summary header.
      — `shared/src/export/pdf-log.ts` (pure HTML builder, snapshot-tested) + `app/src/features/export/use-pdf-export.ts` (assembles it from the
      Stats screen's current period/firearm filters) +
      `app/src/platform/pdf-export.ts` (expo-print → expo-sharing share
      sheet). Wired to a new "Export PDF" button on `/stats`; verified on
      the `shotledger` AVD dev build — Android's native share sheet opened
      with a generated `.pdf` file. **The `VERIFY:` on the layout is
      settled** (#308, PR #339, refined by #367): checked against real
      completed föreningsintyg the maintainer supplied, which stay outside
      the working tree. Two columns were added and two dropped as a result —
      the reasoning is in the `pdf-log.ts` doc-comment.
- [x] FAP 551-3 activity numbers settled and the two cases modeled
      (branch `fix/compliance-fap551-numbers`) — window 6 months;
      **12** activities for FAP 551-3 5 § (no handgun for target shooting
      yet), **6** for 6 § (already holds one), both derived from the
      per-month rate × the window, reading "sammantaget i genomsnitt" as a
      total over the window. Source: PM 551.24 page 3. Which case applies is
      a new shooter-chosen profile variant (`settings.complianceProfileVariant`,
      Settings → Compliance → Activity Requirement, defaulting to the stricter
      5 § case — **flagged for maintainer review**, a UX default). The
      "ytterligare enhandsvapen" and "förnyelse av tidsbegränsat tillstånd"
      rules were transcribed but not modeled here; they landed separately
      (see below). "Särskilda skäl" stay unmodeled — decided by the police,
      not the shooter.
      `SE_VERIFIED = true` now covers the modeled numbers only; the Bilaga 8
      märke-guld proxy keeps its own `ruleVerified: false`. Spec/evidence:
      `docs/specs/compliance-fap551-{spec,evidence}.md`.
- [x] The two **per-firearm** criteria under PM 551.24's _Intyget avser_
      (issue #329, branch `feat/compliance-firearm-criteria`) — "ytterligare
      enhandsvapen" (≥2 activities in six months with each handgun already
      held) and "förnyelse av tidsbegränsat tillstånd" (≥4 **in each of** the
      last two twelve-month windows, not 8 across twenty-four months). Modeled
      as `JurisdictionProfileDefinition.firearmCriteria`, separate from the
      5 §/6 § `ComplianceRule`s, counting only sessions carrying that
      `firearm_id`. The licence facts they turn on were the reason they were
      deferred, and both are already recorded: `firearms.is_own` +
      `weapon_type` for the first, a non-null `licenses.valid_until` — which is
      exactly what "tidsbegränsat" means — for the second. Both proxies are
      named on screen and in the manual, and the card says the app counted
      those sessions, never that anyone attested them (#308).
      Spec/evidence: `docs/specs/compliance-firearm-criteria-{spec,evidence}.md`.
- [x] The case's **default** derived from the firearms (issue #286, branch
      `feat/firearm-own-flag`) — `firearms.is_own` is a plain boolean
      defaulting to **true** (maintainer, 2026-09-18; migration `0002`
      backfills every existing row), and an owned **handgun** (`pistol` or
      `revolver`; not rifle, not airgun) makes the shooter a 6 § case. Since
      ownership defaults to true, a handgun on file derives 6 § — the
      _lighter_ requirement — unless the shooter marks it borrowed. An
      explicit Settings choice still wins, and the derivation is resolved at
      read time, never written back, so a case a shooter has chosen never
      moves under them. Spec/evidence:
      `docs/specs/firearm-ownership-{spec,evidence}.md`.
- **Done when:** license-activity states unit-tested (boundary dates, tombstoned
  sessions excluded); PDF snapshot test of generated HTML.
  — both done. `shared/src/compliance/` was built under the old-coder loop
  (CLAUDE.md mandates it): executable spec in
  `docs/specs/m6-compliance-spec.md` (spec approval: not obtained,
  autonomous run), evidence in `docs/specs/m6-compliance-evidence.md`. 100%
  line/branch/function/statement coverage on `shared/src/compliance/**`,
  Stryker 95.49% on that directory (6 survivors, all classified equivalent
  in the evidence report — the early-return branches they mutate are
  provably redundant given the functions' final clamps/comparisons). Total
  suite: 357 vitest tests (up from 343), including
  `shared/src/export/pdf-log.test.ts` (HTML string snapshots, escaping,
  empty-period case). **VERIFY placeholders shipped at M6, since settled:**
  the `se` profile's `windowMonths`/`requiredActivities` numbers shipped as
  placeholders with `SE_VERIFIED = false`, because no FAP 551-3 numeric source
  text existed in the repo; the checklist item above replaced them with the
  cited PM 551.24 numbers. The license-activity UI still renders the
  `compliance.unverifiedHint` line wherever `profile.verified === false` — the
  general mechanism for any future profile, now unreachable for `se`.
  The Bilaga 8 indicator helpers (`monthsOfLoggedActivity`,
  `pistolskyttemarkeGuldFulfillment`) are implemented and unit-tested in
  `shared/src/compliance/indicators.ts` but have **no UI surface yet** — out
  of scope for this pass; the märke-guld fulfillment rule itself is a
  further VERIFY (≥1 guldserie in 24 months is a placeholder proxy, not a
  confirmed märke-earning rule). Maestro: `app/e2e/m6-compliance.yaml` on
  the `shotledger` AVD dev build — seeds demo data, selects the `se`
  compliance profile in Settings, asserts the Home license-activity chip, the
  firearm-detail license-activity card, then exercises the Stats Custom period
  (native Android date picker, tapped via its own visible "OK" button) and
  asserts the applied-range label. See the M6 task report for the run
  outcome and screenshot paths.

**M5 addition (maintainer request, folded into this branch): Stats custom
period.** The `/stats` period `SegmentedControl` gained a `custom` option
(`STATS_PERIODS`) opening two date pickers
(`@react-native-community/datetimepicker` — ships with Expo SDK 57, not a
new native module choice; **flagged for review** since M2's design-system
inventory didn't anticipate a date-picker component) for from/to; a new
`periodRange()` helper in `app/src/features/stats/use-stats-data.ts`
resolves every period (including `custom`) to a `{fromIso, toIso}` range
consumed by the same live query path — no separate code path for custom vs.
preset periods. A compact label
(`Intl.DateTimeFormat(..., {dateStyle:'medium'})`, joined with an en dash)
shows the chosen range next to the pickers. i18n: `stats.periodCustom`,
`stats.customFrom`, `stats.customTo`, `stats.customRangeIncomplete` (sv/en).

### M7 — CSV, i18n completeness, release prep (branch `feat/m7-release`)

- [x] CSV export (share sheet) + import (validate with zod, dry-run
      report, then upsert). Columns documented in §6.8; round-trip test:
      export → wipe → import → identical stats.
- [x] i18n audit: `pnpm i18n:check` script fails CI on missing keys;
      Swedish reviewed by maintainer
- [x] App icon + splash (placeholder OK), version/about screen with
      licenses, "Support development" opens Buy Me a Coffee URL in
      external browser (URL from config, not hard-coded)
- [x] Play closed-testing build via EAS (`app/eas.json`); store listing
      draft in `docs/store-listing.md` — not yet uploaded, no Play
      Console account exists (see `docs/release.md` §a)
- **Done when:** closed-testing `.aab` uploaded; CHECKLIST in
  `docs/release.md` written for repeatable releases. **Deferred by
  design**: no Google Play account exists yet (`docs/release.md` §a is
  maintainer-only setup) — this pass prepares the release (eas.json,
  checklist, store listing) without publishing, per the M7 task brief.
  The `.aab` upload itself is the first item in `docs/release.md` §a for
  the maintainer to run.

## 5. Screen inventory (v1)

| Route                                      | Purpose                                                                                   | Key states         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ |
| `/` Home                                   | totals card, latest sessions, license-activity summary, FAB                               | empty / seeded     |
| `/session/new`                             | new-session form (kind, name, location, tags)                                             | validation errors  |
| `/session/[id]`                            | series list + stats toggle, add series                                                    | zero series        |
| `/session/[id]/series/[pos]`               | keypad entry                                                                              | integer vs decimal |
| `/stats`                                   | filter form (period, type, discipline, series length, tags)                               | no sessions at all |
| `/stats/report`                            | generated report: records, sum + per-shot totals, charts, export                          | no data for filter |
| `/firearms`                                | list + license-activity chips                                                             | empty              |
| `/firearms/[id]`                           | detail: classes, license, maintenance, ammo usage                                         | expired license    |
| `/firearms/new`, `/firearms/[id]/edit`     | forms                                                                                     |                    |
| `/settings`                                | language, theme, data, support, about                                                     |                    |
| `/dev/components`                          | component gallery (dev only)                                                              |                    |
| Route                                      | Purpose                                                                                   | Key states         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ |
| `/` Home                                   | totals card, latest sessions, license-activity summary, FAB                               | empty / seeded     |
| `/session/new`                             | new-session form (kind, name, location, tags)                                             | validation errors  |
| `/session/[id]`                            | series list + stats toggle, add series                                                    | zero series        |
| `/session/[id]/series/[pos]`               | keypad entry                                                                              | integer vs decimal |
| `/stats`                                   | filters + tiles + charts                                                                  | no data for filter |
| `/firearms`                                | list + license-activity chips                                                             | empty              |
| `/firearms/[id]`                           | detail: classes, license, maintenance, ammo usage                                         | expired license    |
| `/firearms/new`, `/firearms/[id]/edit`     | forms                                                                                     |                    |
| `/tools`                                   | timers, photos, Webshooter — the non-settings hub                                         | disconnected       |
| `/timer`                                   | PAR / IPSC / fält timer (segmented control)                                               | idle vs running    |
| `/webshooter/import`, `/webshooter/starts` | Webshooter competitions and signups                                                       | not connected      |
| `/settings`                                | language, theme, birth year, compliance, account & sync, backup/restore, CSV, about, wipe |                    |
| `/dev/components`                          | component gallery (dev only)                                                              |                    |

## 6. Reference data and formulas

### 6.2 Discipline definitions (data, not code)

`shared/disciplines/definitions/*.json`, validated by zod schema
`disciplineSchema`: `{id, federation: 'SPSF'|'ISSF'|'SvSF'|'generic',
name: {sv,en}, targetFace?, defaultSeriesLength, scoring:
'rings'|'hits', allowsDecimal, weaponGroups}`. **v1 is SPSF-only**
(maintainer decision 2026-09-01): SPSF precision (target: Pistoltavla
25 m precision — §6.5c), SPSF militär snabbmatch, plus generic
ring-scoring for free training. Community adds disciplines via PR once
public.

**Added 2026-09-21 (issue #83):** SPSF magnumprecision (SHB Del G), which
shares the precision target face — G.7.1 p. 205 shoots "Pistoltavla 25 m
precision" at 50 m (G.7.2 p. 206) — and is the discipline that makes the
already-defined vapengrupper `M1`–`M9` reachable.
**Deferred to v2+:** all ISSF disciplines (10m air pistol, 25m pistol,
25m standard, 50m pistol — defaults need VERIFY then). Community adds
disciplines via PR once public.

- [x] **`scoring: 'hits'` and the fältskjutning definition** (#315,
      ADR 0016). `targetFace` is rings-only — a fält round is shot
      against Del D's figure catalogue, not one face — and `spsf-falt`
      carries SHB's vapengrupper A, A optisk, B, C, R. The result model
      is `shared/src/scoring/falt.ts` (spec:
      `docs/specs/falt-scoring-spec.md`). The discipline is registered
      and, since the station entry UI landed, offered — the
      `ringScoringDisciplines()` filter on the pickers is gone.

- [x] **Fält station persistence and entry** (#315 PR 1, spec:
      `docs/specs/falt-stations-spec.md`). `falt_stations` is its own
      table: a station cannot use `is_sighter` (no provskott, D.6.6) or
      `is_final` (no final — a tie is shot off), so nullable columns on
      `series` would have been dead weight both ways. A station records
      hits, figures hit, an optional poängmål with its max, and the two
      flags that take it out of the result — scratched (maintainer:
      annulled for breaking SHB or SäkB) and särskjutning (placement
      only). Both still count six rounds towards volume. The migration
      chain is one regenerated baseline from here on, never appended to.
      Still open on #315 — WebShooter fält import (#352), statistics and
      personal bests for hits sessions, CSV/JSON export and the PDF log
      (PR 2), and the SHB questions that remain unanswered (poängmål ring
      values are settled: the arrangör chooses, so the app records the max
      alongside the score).

### 6.3 Program definitions — competition-type presets (data, not code)

**Series counts are never fixed** (maintainer decision): a session grows
series as the shooter adds them, in every program. A _program_ is a
lightweight preset naming the competition type and its defaults:
`shared/disciplines/programs/*.json`, zod schema `programSchema`:

```
{ id, disciplineId, federation, name: {sv,en},
  shotsPerSeries,                  -- default series length (e.g. 5)
  scoring: 'integer'|'decimal',
  supportsFinal: boolean,          -- final section available in UI
  structure?: {                    -- ONLY for fixed-format programs
    sighterSeries: number,         -- leading sighters (e.g. 1)
    groups: [ { seriesCount, timeLimitSeconds? } ] } }
```

A program **with** `structure` pre-creates its series skeleton on session
start (time limits shown per series, derived from position — no schema
change); a program **without** it is fully freeform (§ above). Precision
is freeform; milsnabb is fixed.

Per-series flags carry the structure instead of the program:
`is_sighter` (provskott) and `is_final` (series belongs to the final).
**Maintainer rule: at most ONE sighter per section** — one in the main
round, one in the final (both flags set on a final's sighter). The UI
disables the sighter toggle once the current section has one.

**Result model — maintainer-confirmed:** when a session contains final
series, three results are tracked and displayed, all derived:

- `beforeFinal` = sum of scored series with `is_final=0`
- `finalScore` = sum of scored series with `is_final=1`
- `total` = beforeFinal + finalScore

Sessions without final series just show the one total.

**Sighter (provskott) semantics — maintainer-confirmed:** excluded from
all scores above and from every **in-session** score statistic, but
**counting toward volume**: shots-logged totals, firearm round counter,
ammo-lot usage.

**Amended 2026-09-16 (`feat/sighters-in-statistics`, issue #138):** outside
a session — the Statistics tab's generated report — a sighter is an
ordinary series, and the report's Sighters filter lets the user exclude
them again. Volume still counts them in both positions, and — maintainer,
2026-09-17 — **a sighter always counts towards a guldserie**, in every
scope and filter position. See `docs/specs/sighters-in-statistics-spec.md`.

v1 predefined programs (defaults marked VERIFY must be confirmed by the
maintainer against Skjuthandboken/ISSF rules before the JSON ships):

| id                     | Federation | Name (sv)          | Defaults                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spsf-precision`       | SPSF       | Precision          | 5 shots/series, integer, supportsFinal, freeform. SHB: ordinary competitions ≥6 series (F.6.1 p. 174); championships 7 + final 3 = 10 (C.3.6.1.1 p. 55); one 5-shot sighter series per round (F.6.6.2, C.3.6.1.1); total = sum of all 10 (final carries over); standardmedalj computed on the 7-series grundomgång (C.5.1.1.4) — which is exactly the stored beforeFinal |
| `spsf-milsnabb`        | SPSF       | Militär snabbmatch | fixed (SHB J.6.1 p. 290, confirmed): 1 provserie of **5 shots** at 10 s, then 4 series à 10 s + 4 à 8 s + 4 à 6 s, 5 shots each = 60 scored shots, max 600. Vapengrupper A, B, C, R                                                                                                                                                                                      |
| `spsf-magnumprecision` | SPSF       | Magnumprecision    | 5 shots/series (G.6.4 p. 200), integer, **no final** (G.1.2 p. 192 "Ej tillämpligt"; ties go to särskjutning, G.6.11.3 p. 204), freeform — G.6.1 p. 199 says "i regel minst sex (6) serier". 5 min per series (G.6.5 p. 200), one 5-shot sighter within 5 min (G.6.6.2 p. 200). Vapengrupper M1–M9; **no klassindelning at all** (G.2.1 p. 193)                          |

ISSF programs (10m air pistol 60/40, 25m pistol, 25m standard, 50m
pistol) are **v2** — their defaults carry VERIFY items to resolve then.

Added 2026-09-16 (#228): `issf-centre-fire-pistol` (ISSF, Grovpistol — the
same structure as `issf-sport-pistol`, Pistol Rules 8.7.6.4) and
`svsf-snabbluftpistol` (SvSF — 1 sighter, then 2 × 10 s + 2 × 8 s + 2 × 6 s
twice, 5 shots each; Reglemente för 10 m Snabbluftpistol §6.1/§6.3). Cited in
`docs/reference/issf-rules.md` and `docs/reference/svsf-rules.md`.

Session names default to `<session type> — <local date>` (e.g. "Tävling —
9 sep 2026") for both types; a competition's identity lives in its own
Competition Name field. Superseded the `<level> <program> <weapon_group>`
competition form on 2026-09-09 at the maintainer's request.

**Särskjutning** (tie-break; F.6.11.3 p. 181: extra series until medals
decided, **no provskott**) is out of v1 scope — log such series as
ordinary extra scored series with a note.

**Decimal scoring — who actually uses it:** per ISSF rules, 10m air
rifle scores decimal in qualification _and_ finals; 10m air pistol and
50m rifle score integer in qualification with **decimal finals only**;
25m pistol events are integer throughout. Everything SPSF in v1 is
integer. The per-session decimal toggle therefore exists mainly for
ISSF-style finals training; storage is uniform regardless (§3
`value_tenths`), so switching modes never migrates data.

### 6.4a Weapon groups and shooter classes

**Group ids are federation-scoped** — `<federation>:<code>` — because
vapengrupper A/B/C/R/M are an SPSF concept that other federations don't
share. Definitions live as data in `shared/disciplines/groups/<fed>.ts`;
a discipline's federation determines the valid set. v1 ships `spsf:*`
(below) plus `generic:airgun`; v2+ adds other federations as data files
(ISSF has events rather than weapon groups — sessions there may leave
`weapon_group` NULL; IPSC divisions like open/production, SvSF, DSB
etc. follow the same pattern). Shooter-class lists are federation-scoped
the same way.

**SPSF** (SHB F.2 p. 163 ff, F.4 p. 169 ff — verified). Two
**orthogonal** axes, stored separately and displayed combined
("C 2" = vapengrupp C, klass 2):

**Vapengrupp (the gun)** — valid set depends on discipline:

- Precision (F.4): `A` (+ optional sub-groups `AM`, `AP`, `AG` — F.4.1),
  `A-opt` (A with optics, F.4.5), `B`, `C`. **No R in precision**
  (F.4.4 "Ej tillämplig").
- Fält & militär snabbmatch add `R` (D.4.4 p. 86, J.4).
- Magnum (G.4.1 pp. 196–197): `M1`–`M9` (SM runs M1–M7 only, C.3.6.2.3).
- App extra: `airgun` (ISSF 10m).

**Klass (the shooter)** — F.2.1 p. 163: `1` (variants `1u` nybörjare,
`1b` bronsskytt, `1s` silverskytt — F.2.5), `2`, `3` (riksmästarklass),
`Jun` (≤ year turning 20), `Dam1`/`Dam2`/`Dam3`, `VetY` (year turning
60+), `VetÄ` (year turning 70+; stödhand allowed in precision, F.6.3.2).
Jun/Dam/Vet shoot vapengrupp C in precision/fält (F.2.1).

**ISSF: events, not klasser.** A federation says "this entry is for these
shooters" in one of two places, and the app models both rather than flattening
them (`shared/src/disciplines/entries.ts`). SPSF puts the category on the
shooter's KLASS; ISSF puts it on the EVENT — 10 m Air Pistol runs as four
separate events (men, men junior, women, women junior) and 25 m Rapid Fire
Pistol as two, because no women's version is recognized. `EntryCategory` is
the shared concept: `{ gender, age }`, two independent axes, because ISSF
multiplies them and one flat enum cannot name _10 m Air Pistol Junior Women_.

Event definitions are transcribed from ISSF Rule 3.3 with the status letters
kept verbatim (`ISSF_RULE_33`); see `docs/reference/issf-rules.md`. A session
stores `event_id` (`<disciplineId>:<gender>:<age>`) where an SPSF one stores
`shooter_class`, and NULL for whichever does not apply. Eligibility ranks and
never gates, on both sides.

Enumerations live in `shared/disciplines/groups.ts` and `classes.ts`
with per-discipline validity. Märke thresholds key off vapengrupp (§6.5).

### 6.5 "Guldserie" = pistolskyttemärke series requirement (SHB, verified)

The colloquial "guldserie" is a series meeting the **pistolskyttemärke
guld** per-series requirement (the term "guldserie" itself does not occur
in SHB). Config in `shared/scoring/marke.ts` — SHB Bilaga 1 mom 5.1.1.1
(p. 452), per 5-shot precision series, by vapengrupp:

| Valör  | A   | B   | C   |
| ------ | --- | --- | --- |
| Brons  | 32  | 33  | 34  |
| Silver | 38  | 39  | 40  |
| Guld   | 43  | 45  | 46  |

Age reduction (same section): −1 point/series from the year _after_
turning 55; −2 points/series from the year after turning 65. Needs the
shooter's birth year in settings (like Shotlytic's DOB field).

### 6.5b Standardmedalj point thresholds (SHB, verified)

Data in `shared/scoring/standardmedalj.ts` — fixed thresholds by
vapengrupp (no age adjustment; C.5.1.2.3 p. 71), precision:

| Series | A/A-opt silver | A brons | B silver | B brons | C silver | C brons |
| ------ | -------------- | ------- | -------- | ------- | -------- | ------- |
| 6      | 277            | 267     | 282      | 273     | 283      | 276     |
| 7      | 323            | 312     | 329      | 319     | 330      | 322     |
| 10     | 461            | 445     | 470      | 455     | 471      | 460     |

&gt;10 series: take the 10-series value ÷10 × series count (C.5.1.2.3).
Militär snabbmatch (12 series, C.5.1.2.5): silver A 540 · R 552 · B 561 ·
C 564; brons A 516 · R 528 · B 537 · C 540. Standardmedalj i guld is not
a score — it is 50 accumulated medal points (brons=1, silver=2; C.5.2.1
p. 73). M5 shows a subtle standardmedalj marker when a session total
meets a threshold; accumulated-points tracking is v2+.

### 6.5c Target dimensions (for v2 photo scoring; SHB, verified)

**Pistoltavla 25 m precision** (F.7.1 p. 182 — note: this, not "C30",
is the precision target; C30/C25 are fältskjutning hit/miss circle
figures, 30×27 / 25×22.5 cm, no rings): X-ring 25 mm, 10 = 50 mm, then
+50 mm per ring to 1 = 500 mm (tolerances ±0.2–2.0 mm); black covers
rings 7–10 (200 mm); ring line 0.2–0.5 mm; distance 25 m. Scoring rule
(F.6.10.1): a hit counts to the higher value as soon as the ring's
**outer edge is touched**. Milsnabb target (J.7.1 p. 297): rings 5–10
only, X = 50 mm, 10 = 100 mm, then +80 mm per ring to 5 = 500 mm.

### 6.8 CSV format

> Updated at M7 (`docs/specs/m7-csv-spec.md`) — the schema gained
> `program_id`/`competition_level`/`is_championship`/`competition_name`/
> `weapon_group`/`shooter_class`/`extra_rounds` on `sessions`,
> `is_sighter`/`is_final` on `series`, and `value_tenths`/`is_inner_ten` on
> `shots` since this section was first written; the column set below
> supersedes the original list.

UTF-8, comma-separated, header row, RFC 4180 quoting, one row per **shot**
plus a defined representation for shot-less structures (§ below). 24
columns, in order:

```
session_id, session_name, session_type, discipline_id, program_id,
competition_level, is_championship, competition_name, weapon_group,
shooter_class, firearm, ammo_lot, started_at, location, notes,
decimal_scoring, extra_rounds, tags, series_position, is_sighter,
is_final, shot_position, value_tenths, is_inner_ten
```

`is_inner_ten_decimal` is **excluded** — it's DEPRECATED in the schema and
nothing writes it. `firearm` is `"{make} {model}"`; `ammo_lot` is the
lot's `label`; both are matched by exact name on import, creating a bare
firearm/lot when no match exists. `tags` is `|`-joined. Booleans are
`1`/`0` on export, and also accept `true`/`false` (case-insensitive) on
import.

**Shot-less structures**: a session with an empty series emits one row
with `series_position`/`is_sighter`/`is_final` set and
`shot_position`/`value_tenths`/`is_inner_ten` blank; a session with zero
series (e.g. an `extra_rounds`-only session) emits one row with every
column from `series_position` onward blank. Every session appears at
least once, even with zero shots.

Import: zod-validated per row (row-level errors, never a thrown
exception), grouped by `session_id`, reconciled into a dry-run plan
(create/update per session by id, create/reuse per firearm/ammo-lot/tag
by name) the UI shows before upsert. Full behavior list and the
round-trip losslessness property: `docs/specs/m7-csv-spec.md`.

## 7. Testing standards

- `shared/`: vitest, 100% of exported functions, table-driven tests.
- App logic hooks: jest-expo where RN APIs unavoidable.
- E2E: Maestro flows per milestone (named `mN-*.yaml`), each ending in a
  screenshot; run on CI-less local loop for now (CI runs unit only until
  an emulator job is added).
- No snapshot tests of whole screens (brittle); snapshot only generated
  HTML (PDF) and CSV strings.

## 8. Agentic loop (what CLAUDE.md must document)

Exact commands for: install (`pnpm i`), start web (`cd app && pnpm expo
start --web`) and how to screenshot it (Chrome tools), start emulator
(`emulator -avd shotledger -no-window -gpu swiftshader_indirect` +
`adb exec-out screencap`), install dev build, run Maestro
(`maestro test e2e/smoke.yaml`), seed/wipe data (dev menu deep link
`shotledger://dev/seed`), run checks (`pnpm check`). CLAUDE.md also
restates §0 rules 1–6 verbatim.

## 9. Deferred to v2 (do not build in v1)

> **Photo target scoring, phase 1, has since shipped** on
> `feat/photo-scoring-phase1` (auto-geometry + tap-to-mark, precision face
> only, behind a calibrated validity gate). Spec and evidence:
> `docs/specs/photo-scoring-phase1-{spec,evidence}.md`; the feasibility work
> it rests on is `docs/specs/cv-spike-report.md`. It added the `shot_marks`
> table (migration `0002_young_hardball`) and two runtime dependencies,
> `react-native-fast-opencv` and `expo-image-manipulator` (§2). Phase 2 — the
> learned hole detector and the score-analysis heatmap — remains deferred.
>
> **Tap-to-mark now runs a fitted hole/patch filter** as a second gate, on
> `feat/cv-hole-patch-filter`: six texture descriptors of the 12 mm crop and a
> logistic regression over them (`shared/src/target-scoring/hole-features.ts`,
> constants fitted in `spike/cv/`). Measured behind the existing proposal
> stage it cuts false positives ~15x, 4.65 to 0.32 per photo, at 90%
> precision. No new dependency — eight constants and no runtime. Spec and
> evidence: `docs/specs/cv-assisted-detection-{spec,evidence}.md`; the
> measurement is `docs/specs/cv-corpus-validation-2026-09.md` §5. The same
> measurement **rejected** loosening the proposal stage behind the filter
> (#264's step 3): it finds fewer holes, not more. Phase 2 is unaffected — this
> is the assisted path getting better, not detection becoming automatic, and
> "Auto Score" stays reserved.
>
> **The app now suggests holes** (2026-09-22, #347/#264): a
> Laplacian-of-Gaussian proposal stage and a 30-feature logistic regression on
> the rectified canvas, ported line for line from `spike/cv/hole_proposals.py`
> to `app/src/features/photo-scoring/hole-proposals.ts` and pinned by a
> synthetic lock-step fixture. Measured on the 31 hand-marked photos with
> corrected labels: 74% recall, 92% precision, 0.32 false positives per photo,
> 10 of 31 series exactly right — against 59% / 90% / 0.32 / 3 for the shipped
> filter. Still assisted: suggestions are dashed marks the shooter checks, and
> "Auto Score" stays reserved. `docs/specs/cv-hole-proposals-2026-09.md` has the
> numbers, including the measured negatives (gradient-boosted trees, the
> before/after diff). The marking screen was rebuilt in the same change (pinch
> about the fingers, one-finger pan, drag-to-move under a loupe, undo, a
> floating action bar, live group figures), the px<->mm transform is stored on
> the series (`series.photo_geometry`) so the photo viewer draws the marks and
> the group figures for any photo-scored series, and every kept suggestion
> reaches the opt-in training store flagged `suggested`.
>
> **The milsnabb face now scores too**, via manual corners only (auto-geometry
> is still never attempted for it), on `feat/milsnabb-photo-corners` — amends
> §10 of the phase 1 spec/evidence. No new dependency, no schema change; the
> shared ring table/scoring and the corner-homography math were already
> face-generic.

> **Backup export/import has since shipped** on `feat/backup-bundles`:
> `.shotledger` bundles (database-only or database+photos), Settings →
> Backup. No new runtime dependency — `.shotledger` is a small hand-rolled
> uncompressed container (`shared/src/backup/`) rather than a zip, since no
> zip library exists in the lockfile and adding one needs the maintainer's
> OK first (not yet asked). See the 2026-09-02 plan.md decisions-log entry
> for the restore-requires-app-restart caveat (no `expo-updates` dependency
> to reload the JS bundle in place).

> **Save to a user-chosen folder has since shipped** on `feat/save-to-folder`
> (plan.md "Export destinations", second of share sheet → chosen folder →
> scheduled → Drive API): Settings → Backup gained "Save database/database +
> photos to folder" next to the existing share-based export, using
> `expo-file-system`'s legacy `StorageAccessFramework` on Android
> (`app/src/platform/save-to-folder.ts`) — no new dependency. iOS has no
> folder-pick-and-write API short of the document picker's export mode (not
> implemented, no Mac to verify), so `save-to-folder.ios.ts` falls back to
> the existing share sheet and the UI says so. The chosen SAF folder URI is
> remembered via the same settings table as `lastBackupAt`, so repeated
> backups go to the same folder with one tap; "Change folder"/"Forget
> folder" rows appear once a folder is remembered.

> **Export scope and the vault opt-in have since shipped** on
> `feat/export-scope-vault-optin`, implementing the maintainer's requirement
> "Export data shall include everything except Vault per default (Vault is
> exported with warning if user explicitly wants it)". Settings -> Backup is
> now two rows (Backup / Restore) with contents and destination chosen in a
> dialog, replacing the four export rows. The scope audit found one real gap:
> **synced photos were silently dropped** from every "database + photos"
> bundle, because a synced series' `photo_uri` is a `shotledger-photo:<id>`
> marker rather than a path -- they now travel in their own `sync-photos/`
> namespace and restore without disturbing the marker. Everything else the app
> stores was already in the DB file; what stays out (caches, pre-restore
> bundles, keystore secrets) is now excluded on purpose and documented. The
> vault is included only behind an acknowledged warning and a passphrase, and
> is **re-wrapped** rather than copied -- the device key cannot leave the
> keystore, so raw vault ciphertext in a bundle would be undecryptable
> anywhere. No new dependency: `expo-crypto` supplies AES-256-GCM and the
> CSPRNG, and PBKDF2-HMAC-SHA256 is implemented in `shared/src/backup/`
> (differentially verified against OpenSSL) because expo-crypto's only hashing
> is a per-call native `digest()`. Spec and evidence:
> `docs/specs/backup-export-spec.md`, `docs/specs/backup-export-evidence.md`.
> The vault opt-in half of this is gone with the Vault (issue #276, below); a
> bundle carrying a vault section still restores, section ignored.

> **Cloud sync + accounts has since shipped** across three branches:
> `feat/sync-backend` (protocol + D1 changelog),
> `feat/backend-auth-photos` (better-auth, R2 photos, quota/rate limit,
> account deletion) and `feat/sync-app` (the client engine, the Account &
> sync screen and the photo queue). `backend/` is no longer hello-world.
> Specs and evidence: `docs/specs/sync-protocol-*`,
> `docs/specs/backend-auth-photos-*`, `docs/specs/sync-app-*`. No new
> dependency was added on the app side. Still open: the `VERIFY:` question
> in `sync-protocol-spec.md` §1 about whether `settings` and `session_tags`
> should sync.

> **All three timers have since shipped.** The time-limit/interval timer
> (`feat/shot-timer`, `shared/src/timer/engine.ts`), the IPSC-style
> microphone shot timer (`feat/ipsc-shot-timer`,
> `shared/src/timer/shot-detector.ts` +
> `app/src/platform/shot-listener.ts`) and the **fälttimer**
> (`feat/falttimer`, `shared/src/timer/falt.ts` +
> `app/src/features/timer/falt-timer.tsx`) sit behind one Timer entry,
> picked with a segmented control ("Skjuttid" / "Skott" / "Fält" — the
> PAR naming was dropped, maintainer 2026-09-10). The fälttimer plays the SHB 2026 D.6.2 p. 88 command sequence
> (LADDA → ALLA KLARA → 10 SEKUNDER KVAR → FÄRDIGA → ELD → the prolonged
> ELD UPPHÖR → PATRON UR → VISITATION), with user-set shooting time and
> parti boundaries on the timeline; its commands are Swedish, spoken and
> on screen, regardless of the UI language. **Reworked 2026-09-09**
> (`feat/field-timer-rework`): the timeline is anchored at ELD (t = 0,
> preparatory commands at negative seconds), it has a range-officer mode
> where LADDA and ALLA KLARA are button presses and a solo mode that is
> automatic from LADDA, each command is numbered and marked on the
> timeline, and MARKERA was dropped — see plan.md's Timers block. Only that
> branch added dependencies — `expo-speech` and `expo-haptics`, both
> maintainer-approved 2026-09-02, behind `app/src/platform/speech.ts` and
> `app/src/platform/haptics.ts`; speech also gave the IPSC prompts a voice,
> with the tone as the fallback, and haptics now backs the parti/ELD pulses
> on all three timers via `platform/timer-cues.ts`. Device screenshots (idle
> / during ELD / finished) are attached to the `feat/falttimer` PR.
> See plan.md's Timers block for each timer's documented limits (fälttimer:
> no silent-mode gate, no whistle sample, no scrubbing; IPSC: 80 ms
> debounce, thresholds not calibrated on a real firing line).

> **Share cards have since shipped** on `feat/share-cards`: a session card
> and a per-series card, drawn with `react-native-svg` (already a direct
> dependency) and rasterized to PNG via its `Svg.toDataURL()`, shared through
> `expo-sharing`. No new dependency — see the 2026-09-02 plan.md
> decisions-log entry.

> **Scan a physical license card has since shipped** on
> `feat/license-card-ocr`: the firearm detail screen's license form gained
> "Scan card" actions that photograph (or pick) a Polisen vapenlicens card
> and pre-fill it via on-device ML Kit text recognition, the one new
> dependency (`@react-native-ml-kit/text-recognition`, see the 2026-09-02
> plan.md decisions-log entry). See `docs/specs/license-card-ocr-spec.md`/
> `-evidence.md` for the parser rules, the privacy boundary and the
> synthetic-card device verification (screenshot `ocr-01-scan-prefill.png`).

> **The Statistics tab has since been rebuilt** on `feat/analytics-filters`
> (maintainer feedback: streamline the UI/UX, add the missing tag filter,
> generate the statistics on the fly). `/stats` is a filter form and
> `/stats/report` the generated report; the pure engine is
> `shared/src/scoring/analytics.ts` (old-coder loop —
> `docs/specs/analytics-report-spec.md`/`-evidence.md`, 100% coverage,
> Stryker 98.70%). The report also carries the sum totals next to the
> per-shot ones, and its Export button now asks for a format: PDF (the M6
> shooting-log builder, restricted to the matched session ids), JSON (the
> new `shared/src/export/json-log.ts`) or CSV (the M7 exporter over the
> same filtered `SessionExport[]`) — the vault in none of them. Charts are
> hand-drawn `react-native-svg`; §2's chart row has been corrected to say
> so. See the 2026-09-03 plan.md decisions-log entries.
> **The scanned original is now kept by default** (`feat/license-card-image`,
> maintainer report: "we want the original picture as well — shooting stores
> need to see that"). The vault-store switch defaults to `true`; the license
> row gets a nullable `licenses.vault_document_id` column (migration 0005)
> pointing at the vault document, and a "Show license card" action on the
> license row opens it full-screen behind the vault's biometric gate. The
> vault's own "Add to vault" screen (Weapon license + Photo) also offers the
> same scan, and can create a license record from it. See the updated
> `docs/specs/license-card-ocr-spec.md`/`-evidence.md`.

> **The Vault has since been removed** (issue #276, maintainer 2026-09-16:
> licenses are going digital, and a license picture — if it is ever needed
> again — belongs next to the firearm, not in a separate encrypted store).
> That withdraws the "we want the original picture as well" requirement the
> paragraph above records, so the scan now keeps only the recognized fields
> and deletes the image. Gone with it: the `/vault` screens, the vault store,
> the AES-GCM envelope, the passphrase re-wrap of ADR 0007, the Android
> backup-exclusion config plugin, `licenses.vault_document_id` (migration
> `0001`), and the `expo-crypto`, `expo-local-authentication` and
> `@noble/hashes` dependencies. A bundle written by a build that still had
> the Vault restores unchanged, with its vault section ignored.

> **Sight settings have since shipped** on `feat/sight-settings` (issue #114,
> replacing a phone note the maintainer kept per firearm). A `sight_settings`
> row is a shooter-named profile — free-text label, signed elevation/windage
> clicks, notes, and an `is_active` flag ("aktuell inställning") — hanging off
> a firearm (migration `0007`, synced like every other firearm-owned table).
> Clicks are relative to whatever zero the shooter picked, so the app never
> asserts an absolute setting: `sightTurnsBetween` in
> `shared/src/firearms/sight-settings.ts` reports only the **difference** from
> the active profile, which is what actually gets dialled. Two surfaces: the
> firearm detail screen manages the list, and the session detail screen shows
> a one-tap chip row ("Boll · 6 up") so the sights can be switched between
> series without leaving scoring. `resolveActiveSightSetting` tolerates two
> rows arriving active from a last-write-wins sync. No new dependency, no
> backend change — `sync_rows` is table-agnostic.

Photo target scoring; Webshooter import; iOS release.

Design notes for these live in plan.md and need maintainer + Fable-level
sessions before implementation.
