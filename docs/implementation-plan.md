# ShotLedger — Implementation Plan (v1)

> Execution spec for implementing agents. [`plan.md`](../plan.md) says
> *what and why*; this document says *exactly how*. It is written so that
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
   `~/agents/shotledger/`, outside the tree); remove or weaken a test to
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
│       ├── compliance/   FAP 551-3 barometer logic (§6.6)
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

| Purpose | Library | Note |
|---|---|---|
| Navigation | expo-router | file-based; predictable for agents |
| Local DB | **expo-sqlite** + Drizzle ORM | expo-sqlite has web/WASM support — required by the agentic web loop. (op-sqlite rejected: no web.) |
| Migrations | drizzle-kit | SQL files in `app/src/db/migrations/`, bundled, run at app start via Drizzle's migrator |
| IDs | UUIDv7 (`uuidv7` pkg) | sortable, sync-friendly |
| State | zustand (UI state only) + Drizzle live queries (data) | no Redux |
| Charts | victory-native | Skia-based |
| Dates | date-fns + date-fns-tz | store UTC ISO-8601 in DB; display local |
| Forms | react-hook-form + zod | zod schemas live next to features |
| i18n | i18next + react-i18next + expo-localization | |
| Notifications | expo-notifications (local only in v1) | license/maintenance reminders |
| PDF | expo-print (HTML → PDF) | FAP 551-3 export |
| E2E | Maestro | flows in `app/e2e/` |

## 3. Database schema (v1 — write exactly this, as Drizzle tables)

Conventions: table names snake_case plural; every table has
`id TEXT PRIMARY KEY` (UUIDv7), `created_at TEXT NOT NULL`,
`updated_at TEXT NOT NULL` (both UTC ISO-8601), `deleted_at TEXT NULL`
(tombstone — **soft-delete everywhere**; queries always filter
`deleted_at IS NULL`). These three columns are the sync foundation; never
hard-delete rows.

```
firearms        make TEXT NOT NULL, model TEXT NOT NULL, caliber TEXT,
                serial_number TEXT,            -- optional, sensitive
                license_expires_on TEXT,       -- date, nullable
                notes TEXT,
                round_count INTEGER NOT NULL DEFAULT 0,
                maintenance_interval_rounds INTEGER,   -- nullable
                rounds_since_maintenance INTEGER NOT NULL DEFAULT 0

firearm_classes weapon per SPSF class: firearm_id FK, class TEXT
                CHECK(class IN ('A','B','C','R','airgun')),
                is_default_for_class INTEGER NOT NULL DEFAULT 0

ammo_lots       brand TEXT NOT NULL, product TEXT, caliber TEXT,
                lot_number TEXT, grain REAL, purchased_on TEXT,
                quantity INTEGER, notes TEXT

sessions        name TEXT NOT NULL,            -- default: discipline + date
                type TEXT NOT NULL CHECK(type IN ('training','competition')),
                discipline_id TEXT NOT NULL,   -- key into discipline defs (§6.2)
                weapon_class TEXT,             -- 'A'|'B'|'C'|'R'|'airgun', nullable
                firearm_id TEXT NULL FK,
                ammo_lot_id TEXT NULL FK,
                started_at TEXT NOT NULL,
                location TEXT, notes TEXT,
                decimal_scoring INTEGER NOT NULL DEFAULT 0

series          session_id FK NOT NULL, position INTEGER NOT NULL, -- 1-based
                photo_uri TEXT NULL            -- local file URI

shots           series_id FK NOT NULL, position INTEGER NOT NULL,
                value REAL NOT NULL,           -- 0–10.9
                is_inner_ten INTEGER NOT NULL DEFAULT 0,  -- X
                is_inner_ten_decimal INTEGER NOT NULL DEFAULT 0 -- (X)

maintenance_events firearm_id FK, performed_at TEXT NOT NULL,
                   kind TEXT NOT NULL,         -- free text v1
                   round_count_at INTEGER, notes TEXT

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
- [ ] pnpm workspace + `create-expo-app` (TypeScript template) in `app/`,
      expo-router installed, dev build config (`expo prebuild` clean)
- [ ] `shared/` package with vitest wired; `backend/` = `wrangler init`
      Hono hello-world only (not deployed)
- [ ] tsconfig.base (strict true, noUncheckedIndexedAccess true), eslint
      (typescript-eslint + react-hooks + react-native), prettier
- [ ] `.github/workflows/ci.yml`: on PR → pnpm check (see §1)
- [ ] CLAUDE.md (repo root) per §8
- [ ] Theme tokens file + light/dark via `useColorScheme`
- **Done when:** app boots on Android emulator AND `expo start --web`
  renders in a browser; CI file lints.

### M1 — data layer (branch `feat/m1-schema`)
- [ ] Drizzle schema exactly per §3; initial migration generated
- [ ] Migrator runs at app start (blocking splash until done)
- [ ] Seed fixture + dev menu toggle ("Load demo data" / "Wipe data")
- [ ] Repository functions in `app/src/db/queries/` (typed, tested):
      createSession, addSeries, addShot, listSessions(filter), CRUD for
      firearms/ammo/tags; all writes set `updated_at`, deletes set
      `deleted_at`
- **Done when:** vitest/jest cover every query function; seed renders in a
  debug list screen.

### M2 — navigation shell + design system (branch `feat/m2-shell`)
Tabs (expo-router): **Home** `/`, **Statistics** `/stats`, **Firearms**
`/firearms`, **Settings** `/settings`. Session flow is modal-stacked:
`/session/new`, `/session/[id]`, `/session/[id]/series/[pos]`.
- [ ] Design-system components in `app/src/components/`: Screen, Card,
      StatTile, Chip, SegmentedControl, ListRow, EmptyState, FAB,
      PrimaryButton, ScoreKeypad (M3). Each gets a story-like demo route
      under `/dev/components` (dev builds only) so agents can screenshot
      components in isolation.
- [ ] Home: "Shots logged" total card, latest 10 sessions list (name,
      date, total, type chip), FAB "New session". Empty state with a
      friendly CTA when no data.
- [ ] Settings: language (system/sv/en), theme (system/light/dark),
      "Load demo data" (dev), placeholder "Support development" row.
- **Done when:** Maestro flow `smoke.yaml` walks all tabs on seeded data,
  screenshots each; web target renders all tabs.

### M3 — score entry (branch `feat/m3-score-entry`) — the core UX
New-session form: type (training/competition — both free), discipline
picker (from §6.2 definitions), weapon class, firearm (defaults to the
class default), ammo lot, decimal toggle (only if discipline allows),
name (default `<discipline> — <local date>`).

**ScoreKeypad spec** (get this exactly right):
- Keys: `1–9`, `0`, `X`, `(X)`, backspace. Integer mode: tap = one shot
  (X ⇒ value 10, is_inner_ten=1; (X) hidden). Decimal mode: two taps per
  shot — "10" then "9" ⇒ 10.9; `X` ⇒ 10.9 + is_inner_ten; `(X)` ⇒
  is_inner_ten_decimal (VERIFY exact SPSF/ISSF meaning of "(X)" with
  maintainer before M3 review).
- Shot chips fill left→right for the series length defined by the
  discipline (5/6/10 or custom); running series total always visible;
  editing a chip re-selects it, keypad overwrites.
- Series saved ⇒ append next empty series automatically; session total
  updates live. Guldserie: when discipline+class has a threshold (§6.5)
  show "Guld vid N poäng" and a badge when reached.
- [ ] Keypad component + logic in `shared/scoring/entry.ts` (pure,
      vitest-tested: all key sequences, both modes, edit flows)
- [ ] Session detail screen: Series list (chips per shot, per-series
      totals) / Stats toggle (M5 fills stats)
- [ ] Attach photo to series (expo-image-picker; camera or library) —
      free, stored as local URI
- **Done when:** Maestro flow enters a full 5-series C-precision session
  by tapping and asserts the computed total; unit tests cover scoring
  edge cases (0, miss, X in both modes).

### M4 — firearms, ammo, compliance data (branch `feat/m4-gear`)
- [ ] Firearms CRUD screens; classes per firearm; per-class default;
      round counter auto-incremented by session save (shots × 1, only
      firearm-linked sessions); manual adjust with reason
- [ ] Maintenance: log event, interval setting, "rounds since" indicator
      (green/amber/red at 80%/100%), local notification at 100%
- [ ] License expiry: date per firearm, local notifications at 90/30/7
      days before (VERIFY preferred lead times with maintainer)
- [ ] Ammo lots CRUD; session links lot; per-lot usage count
- **Done when:** Maestro covers create-firearm → session → round count
  incremented → maintenance amber; notifications verified by unit-testing
  the scheduling function (not the OS delivery).

### M5 — statistics (branch `feat/m5-stats`) — live views, never a form
All math in `shared/scoring/stats.ts` (vitest): series mean, session mean
per shot, standard deviation (sample), best/worst series, X counts,
rolling trend (per-session mean over time), comparison of last N series
vs previous N (default N=100), guldserie count per period, per-firearm
and per-ammo-lot aggregates.
- [ ] Stats tab: period filter (30d/6m/12m/all — segmented, default 6m),
      discipline + class + firearm filter chips; StatTile grid (total
      shots, sessions, mean, SD, X%, guldserie count); trend line chart;
      shot-value distribution bar chart
- [ ] Session detail Stats toggle: totals, mean, SD, X count,
      distribution mini-chart, comparison vs the user's last 100 series
      of the same discipline/class
- **Done when:** stats screens render from seed deterministically
  (Maestro screenshot compares stable numbers), formulas unit-tested
  against hand-computed fixtures.

### M6 — FAP 551-3 barometer + PDF (branch `feat/m6-compliance`)
Logic in `shared/compliance/` driven by a config object, not hard-coded:
`{windowMonths: 6, requiredActivities: N, countsAs: …}` per weapon class.
`VERIFY:` exact FAP 551-3 5 kap activity requirements (count, window,
what counts as an activity, per weapon class) with the maintainer — they
review föreningsintyg professionally; encode their answer as the default
config and cover with tests.
- [ ] Barometer UI on Home + per firearm: activities in rolling window vs
      required, green/amber/red
- [ ] PDF export (expo-print): shooting log for a chosen period/firearm —
      layout: club-log style table (date, discipline, type, series count,
      score, location) + summary header. `VERIFY:` layout against a real
      föreningsintyg-attachment example from the maintainer.
- **Done when:** barometer states unit-tested (boundary dates, tombstoned
  sessions excluded); PDF snapshot test of generated HTML.

### M7 — CSV, i18n completeness, release prep (branch `feat/m7-release`)
- [ ] CSV export (share sheet) + import (validate with zod, dry-run
      report, then upsert). Columns documented in §6.8; round-trip test:
      export → wipe → import → identical stats.
- [ ] i18n audit: `pnpm i18n:check` script fails CI on missing keys;
      Swedish reviewed by maintainer
- [ ] App icon + splash (placeholder OK), version/about screen with
      licenses, "Support development" opens Buy Me a Coffee URL in
      external browser (URL from config, not hard-coded)
- [ ] Play closed-testing build via EAS; store listing draft in
      `docs/store-listing.md`
- **Done when:** closed-testing `.aab` uploaded; CHECKLIST in
  `docs/release.md` written for repeatable releases.

## 5. Screen inventory (v1)

| Route | Purpose | Key states |
|---|---|---|
| `/` Home | totals card, latest sessions, barometer summary, FAB | empty / seeded |
| `/session/new` | new-session form | validation errors |
| `/session/[id]` | series list + stats toggle, add series | zero series |
| `/session/[id]/series/[pos]` | keypad entry | integer vs decimal |
| `/stats` | filters + tiles + charts | no data for filter |
| `/firearms` | list + barometer chips | empty |
| `/firearms/[id]` | detail: classes, license, maintenance, ammo usage | expired license |
| `/firearms/new`, `/firearms/[id]/edit` | forms | |
| `/settings` | language, theme, data, support, about | |
| `/dev/components` | component gallery (dev only) | |

## 6. Reference data and formulas

### 6.2 Discipline definitions (data, not code)
`shared/disciplines/definitions/*.json`, validated by zod schema
`disciplineSchema`: `{id, name: {sv,en}, targetFace, seriesLength,
seriesCount?, scoring: 'rings'|'hit-figure', allowsDecimal, weaponClasses,
federation: 'SPSF'|'ISSF'|'generic'}`. v1 ships: SPSF precision (C30
target, 5-shot series), SPSF fält (hit/figure — logging only in v1), ISSF
10m air pistol, ISSF 25m pistol, ISSF 50m pistol, generic ring-scoring.
Community adds disciplines via PR once public.

### 6.5 Guldserie thresholds
Config in `shared/scoring/guldserie.ts`. From research: class C = 46,
class A = 48 (precision, 5-shot standing). `VERIFY:` full official SPSF
table (all classes, age adjustments) with the maintainer before M3 ships;
mark unknown entries `null` = feature hidden for that class.

### 6.8 CSV format
UTF-8, comma-separated, header row, one row per **shot**, RFC 4180
quoting: `session_id, session_name, session_type, discipline_id,
weapon_class, firearm, ammo_lot, started_at, series_position,
shot_position, value, is_inner_ten, is_inner_ten_decimal, location, tags`
(tags `|`-joined). Import matches firearms/lots by name, creates missing.

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
Photo target scoring; cloud sync + accounts (backend/ stays hello-world);
WebShooter import; document vault; share cards; timers; iOS release.
Design notes for these live in plan.md and need maintainer + Fable-level
sessions before implementation.
