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

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-31 | Name: **ShotLedger** (~40 candidates collision-checked; runners-up in reserve: MarksmanLedger, MeanRadius, Groupline)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-31 | Open source — but **private repo initially**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-31 | Android first; iOS later — all code stays iOS-ready (cross-platform modules only, platform quirks behind small wrappers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-31 | Stack: React Native + Expo + TypeScript; local SQLite as source of truth; Cloudflare (Workers + D1 + R2 + better-auth) for optional sync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-31 | Free app; donations via Buy Me a Coffee (browser link, unlocks nothing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-31 | Scope: target shooting only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-09-01 | Dark theme reworked to "Purple Rain" (deep near-black purple ground, purple-tinted text/borders); gold accent proposed as default over lavender on WCAG AA margins, pending maintainer sign-off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-01 | **Accent resolved: lavender** (maintainer: "do not use yellow for buttons"). `Colors.dark.primary` is `#B98CFF`; the gold values stay in `app/src/theme/tokens.ts` as `PURPLE_RAIN_GOLD_ACCENT_REJECTED`, never assigned to an interactive token. Semantic colours (success/warning/danger) unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-01 | **Scoring keys resolved** (maintainer): keypad is `1–9`, `0`, `10`, `X` — `10` is an ordinary ten, `X` is the centrumtia (`is_inner_ten=1`), same keys in integer and decimal modes. No `(X)` key; `is_inner_ten_decimal` deprecated (column kept, never written). Closes M3 spec VERIFY items V1 and V2; recorded as append-only amendments A1/A2 in `docs/specs/m3-scoring-spec.md` (A2 supersedes A1's labels)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-09-01 | Sessions get `extra_rounds` (nullable, migration 0001): rounds fired but never scored. Counts toward the firearm round counter, ammo-lot usage and volume totals; excluded from every score statistic and from the series/shots structures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-09-01 | Session detail header shows the per-series average and the X count; session lists show total · average/series · X count. The per-shot mean stays in the Stats toggle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-01 | English discipline/program names use Title Case ("Military Rapid Fire"); Swedish keeps sentence case ("Militär snabbmatch"). Firearms tab is "Firearms & Ammo" / "Vapen & ammo"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-01 | M6 compliance profile (§6.6): `shared/compliance` ships an `se` profile with **VERIFY placeholder** activity numbers (`windowMonths=6`, `requiredActivities=4`, `constants-se.ts`, `SE_VERIFIED=false`) — no FAP 551-3 numeric source text exists in this repo; barometer UI shows an explicit "unverified defaults" hint until the maintainer confirms. Settings' Compliance profile picker defaults to `se` when the device locale is `sv`, else `none` — **flagged for maintainer review**, a UX default not a confirmed product call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-09-01 | M6 PDF export layout (club-log table + summary header, `shared/src/export/pdf-log.ts`) has **not** been checked against a real föreningsintyg attachment — VERIFY, per implementation-plan.md §4 M6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-09-01 | Stats "Custom" period picker uses `@react-native-community/datetimepicker` (ships with Expo SDK 57) — flagged for review since it wasn't in M2's original design-system component inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-09-01 | v2 document vault built ahead of its originally-planned order (implementation-plan.md §9 listed it "deferred to v2... needs maintainer + Fable-level sessions before implementation") — done autonomously per an explicit task brief, not a self-directed schedule change; flagged for maintainer review. Crypto: `expo-crypto`'s built-in AES-256-GCM (`AESEncryptionKey`/`aesEncryptAsync`/`aesDecryptAsync`, added upstream in SDK 55, present in the installed `expo-crypto@57.0.2`) — no `react-native-quick-crypto`, no Web Crypto polyfill, no hand-rolled cipher. **Three new flagged dependencies**, all Expo-maintained and SDK-pinned: `expo-crypto`, `expo-secure-store` (vault key, hardware-backed keystore/keychain), `expo-local-authentication` (biometric/passcode gate); `expo-file-system` also newly promoted from a transitive to a direct dependency. Android auto-backup excludes the vault directory (`app/plugins/withVaultBackupExclusion.js`, a local config plugin — no new dependency, `expo/config-plugins` ships with `expo`); the iOS equivalent (`NSURLIsExcludedFromBackupKey`) is **not implemented** — no Mac available to this agent and no Expo module exposes the flag without a small custom native module, tracked as a follow-up. See docs/specs/document-vault-spec.md and -evidence.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-09-01 | M7 release prep: `android.package` set to `app.shotledger` (maintainer-vetoable, separate commit); app icon/splash are hand-rolled placeholder concentric-ring PNGs in the Purple Rain palette (no image tool available, zero new deps); store title _"ShotLedger — Target Shooting Log & Scoring"_ may overclaim vs. v1 (no photo scoring yet) — flagged with a v1-scoped alternative title in `docs/store-listing.md`, maintainer to pick                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-09-01 | v3 shot timer (maintainer-approved scope expansion, `feat/shot-timer`, `docs/specs/shot-timer-spec.md`): PAR/interval timer engine (`shared/src/timer/`) plus a milsnabb drill preset generated from `spsf-milsnabb`'s program `structure`. `expo-audio` (not the deprecated `expo-av`) and `expo-keep-awake` added to `app/`; audio cues are 4 locally-generated placeholder WAV tones — real sound design and on-device audio/vibration/keep-awake verification are a maintainer smoke-test item (emulator audio can't be meaningfully checked). Milsnabb's ready delay defaults to a practical 5 s, not SHB J.6.2's 60 s LADDA→FÄRDIGA cadence (documented simplification, authentic value exposed as a constant)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-02 | Backup export/import (`feat/backup-bundles`): `.shotledger` bundles are a small hand-rolled uncompressed container (`shared/src/backup/container.ts`, magic + length-prefixed entries) — no zip library exists in the lockfile (checked fflate/jszip/adm-zip: zero matches) and CLAUDE.md hard rule 2 forbids adding one without asking, so this ships instead of blocking on that ask; revisit if a zip dependency is approved later. `expo-document-picker` was **not** added — mirrors `csv-import.ts`'s existing use of `expo-file-system`'s `File.pickFileAsync`. Export: `VACUUM INTO` a temp copy (never the live file), rewrite that copy's `series.photo_uri` to the bundle-relative `photos/<id>.<ext>` for the database+photos kind, count rows for the manifest, `serializeAsync()` the copy into the bundle. Restore is a full replace: writes an automatic pre-restore backup, closes the live expo-sqlite connection, overwrites the DB file on disk, restores photos into `Paths.document/backup-photos/` and rewrites their paths via a short-lived connection — **the app cannot reopen its own closed DB singleton without a JS-reload dependency it doesn't have (no `expo-updates`), so restore ends with a "close and reopen the app" prompt** rather than a live reload; flagged for maintainer review as a UX gap worth an `expo-updates` ask later. Schema compatibility refuses a bundle whose `schemaMigrationIdx` is newer than this build's own migrations (`shared/src/backup/compat.ts`); an older bundle is silently brought up to date by the existing migration gate on next launch. The vault is excluded by design, unchanged from its existing boundary comment                                                                                                                                                         |
| 2026-09-02 | Share cards (`feat/share-cards`): the task brief for this work assumed `@shopify/react-native-skia` was already a dependency (via victory-native) — it is not, in this repo state (checked `pnpm-lock.yaml`, `app/package.json`; no `node_modules` either). Rather than add a new native dependency under a deadline without asking first (hard rule 2), the card is drawn with `react-native-svg` primitives — already a direct dependency, used by `GroupPlot`/`TargetFace` — and rasterized on-device via that library's own `Svg.toDataURL()` PNG snapshot method, so no new dependency was added at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-09-02 | Backup export/import device verification (`feat/backup-bundles`, `shotledger` AVD): both bundle kinds export via the share sheet with correct filenames and manifests (30 sessions/216 series/1080 shots/2 firearms; demo data has no photos, so the database+photos bundle's photo count is 0 — not separately exercised on-device); both parse cleanly with the `shared/src/backup/container.ts` format (magic, entry count, valid `SQLite format 3` header) via a standalone Node re-implementation of `unpackContainer`. Restore via the system file picker (`File.pickFileAsync`) worked on the first attempt this run — the picker's "Recent" list surfaced the just-exported file directly, no drawer/Downloads navigation needed. Restore preview, confirmation, automatic pre-restore backup (written to `files/pre-restore-backups/`), and the "close and reopen the app" prompt all matched spec; after a full app restart, all 30 sessions were back. No app-code bugs found. One environment gotcha worth recording: this sandbox's shared `shotledger` AVD had a dev-client APK built by a different worktree/agent, and `expo run:android --port 8081` alone did not fix it — Gradle treated the native project as up to date and skipped repackaging (`react_native_dev_server_port` in the generated `gradleResValues.xml` updated to 8081, but the installed APK still opened its dev-menu socket against the old build's `10.0.2.2:8082`, i.e. a different worktree's Metro, which is why the whole Settings → Backup card was invisible until this was found — it does not exist in that stale bundle). Fix: `cd android && ./gradlew assembleDebug --rerun-tasks -PreactNativeDevServerPort=<port>`, then `adb install -r app/build/outputs/apk/debug/app-debug.apk` explicitly, rather than relying on the Expo CLI's own install step |
| 2026-09-02 | Licence-card OCR dependency: **`@react-native-ml-kit/text-recognition@2.0.0`** (MIT), the maintainer-approved single new dependency for plan.md v2 "Scan a physical license card". Google ML Kit text recognition v2 on both platforms — the Latin model is bundled in the app binary and inference runs **on-device, with no network call**, which is the requirement that ruled out any cloud OCR API. Chosen over `react-native-mlkit-ocr` (last published 2023, unmaintained). No config plugin and no extra Gradle/Pod settings are needed: Android autolinks the library and RN's Gradle plugin supplies the `namespace` its pre-AGP-8 `build.gradle` omits; iOS pulls `GoogleMLKit/TextRecognition` 8.0.0 via the package's own podspec, so `expo prebuild` reproduces the setup unchanged. It is a legacy-architecture native module and works through RN 0.86's interop layer — the risk to watch if the interop layer is dropped. Wrapped behind `app/src/platform/text-recognition.ts` (+ `.web.ts` stub) per hard rule 6. See `docs/specs/license-card-ocr-spec.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

- Photo target scoring, split into two phases by the CV spike
  (`docs/specs/cv-spike-report.md`): geometry works (67% lock on the
  precision face, 0.51 mm median ring residual), classical hole detection
  is a proven dead end (two rounds, 36% recall, 0.0 points of improvement).
  - [x] **Phase 1 — auto-geometry + tap-to-mark** (`feat/photo-scoring-phase1`;
        spec + evidence in `docs/specs/photo-scoring-phase1-{spec,evidence}.md`).
        Precision face only; milsnabb shows "not supported yet" rather than a
        2.5×-wrong ring scale. Includes the **validity gate** the spike's §6.3
        demands — two corpus photos locked onto sky and gravel with plausible
        residuals, so a residual is not a validity check.
  - [x] **Milsnabb via manual corners** (`feat/milsnabb-photo-corners`; amends
        §10 of the phase 1 spec/evidence). Auto-geometry is still never
        attempted for milsnabb (2.5× ring-scale risk stands), but capture now
        goes straight to the four-corner screen instead of "not supported" —
        `corners.ts`'s homography math was already face-generic, as was the
        milsnabb ring table/scoring in `shared/target-scoring`; the new work
        was wiring `scan.tsx` to skip the auto path for this face and adding a
        drag-tracking zoom loupe to `corner-adjuster.tsx`. Verified against
        hand-picked corners on 3 real milsnabb corpus photos (median residual
        ~9 mm on an independent validation ring — see evidence §10). One
        finding flagged, not fixed: the true outermost ring isn't always in
        frame on a landscape crop; no ring-choice UI was built for that.
  - [ ] Phase 2 — learned hole detector (centre heatmap on the 4 px/mm
        rectified canvas), trained on opt-in corrections; score-analysis
        heatmap screen
- [ ] Swedish targets first (Pistoltavla 25 m precision) alongside ISSF faces
      — precision face shipped in phase 1; ISSF faces still to do
- [x] Group analytics: MPI (windage/elevation), mean radius, extreme spread
      (`shared/src/scoring/group.ts`, old-coder loop)
- [ ] Group analytics, remainder: points-lost-to-group-size, session heatmaps
- [x] WebShooter competition import: placements, per-station scores
      (series-total granularity, no per-shot detail), weapon classes,
      standard medals → logbook. `docs/specs/webshooter-integration-spec.md`,
      `docs/specs/webshooter-core-spec.md`, `docs/specs/webshooter-app-spec.md`.
      Auth: in-app password login direct to webshooter.se (PR #19), manual
      token fallback; live login endpoint shape still VERIFY-stubbed.
- [x] **ShotLog import — maintainer/dev tool** (decided 2026-09-02,
      shipped 2026-09-02) — the maintainer's ShotLog export is
      **session-level only**: one row per session with a total, no series
      and no shots. Each row becomes a session with a single total-override
      series (`external_source='shotlog'`, `external_ref` = a content
      hash), the same granularity the WebShooter import already uses — so
      nothing in `shared/src/scoring/` changed. Selective, dedup-first flow
      like WebShooter's (preview → per-row verdict → choose → import).
      **Scope is deliberately a dev tool, not a shipped feature**: it lives
      on `/dev` next to "Load demo data", because ShotLog users encode
      discipline, class and firearm in personal free-text tag conventions
      that no importer can read for them. Instead the screen lists every
      distinct tag in the file with a guessed role — discipline,
      competition, sighter, final, DNF, weapon group, firearm, or "keep as
      a plain tag" — from generic SPSF vocabulary only, and the user
      corrects any of them before importing; a firearm-role tag creates the
      firearm if the logbook has none like it. `docs/specs/shotlog-import-spec.md` + old-coder evidence in `docs/specs/shotlog-import-evidence.md` (100%
      coverage, 100% mutation score). The four `VERIFY:` items are
      **answered** (2026-09-02): `Number of X` = tens, `(X)` = inner tens;
      `Warmup` means the total includes a sighter (never subtracted);
      `A Opt` is a real SPSF class; the shared timestamp is a lost date.
      **One follow-up is open** — the schema has no session-level ten /
      inner-ten counter to write those two numbers into (a total-override
      series has no `shots` rows), so they live in the session note until a
      migration adds one. Evidence report §7.
- [x] **Backup export/import** (decided 2026-09-02, `feat/backup-bundles`),
      two bundle kinds — see the 2026-09-02 decisions-log entry for the
      container format and restore-restart caveat:
  - [x] _Database only_ — the SQLite file (`VACUUM INTO` a consistent copy,
        never the live file), plus a manifest (app + schema version) so a
        restore can refuse a newer schema and migrate an older one.
  - [x] _Database + all pictures_ — a single `.shotledger` bundle: the same
        SQLite copy + every target/series photo, paths rewritten so restore
        is location-independent.
  - [x] Restore = full replace with confirmation (and an automatic pre-restore
        backup), never merge; the vault is excluded by design — it never
        leaves the device.
- [ ] **Export destinations** (feature list, to be prioritised): the OS share
      sheet (any app — already used by CSV/PDF; covers Google Drive, iCloud
      Drive, Nextcloud, mail, Signal… via their share targets, zero code) —
      **done**; save to a user-chosen folder (Android SAF / iOS Files —
      `expo-file-system` + document picker) — **done**, `feat/save-to-folder`,
      Android only (SAF), iOS falls back to the share sheet; scheduled
      automatic backup to a chosen folder (daily/weekly, keep last N); direct
      Google Drive (Drive API + Google sign-in — only worth it for the
      scheduled case, since the share sheet already reaches Drive manually);
      our own cloud sync as the "just works" option once accounts exist.
      Order proposed: share sheet → chosen folder → scheduled → Drive API.
- [x] Optional cloud sync (Cloudflare); photos to R2 — backend on
      `feat/sync-backend` + `feat/backend-auth-photos`, client on
      `feat/sync-app`. Opt-in email+password account (better-auth bearer
      plugin; no social provider is configured, so none is offered),
      trigger-backed SQLite outbox, strict pull→push cycle, LWW with
      tombstone precedence per ADR 0003. See
      docs/specs/sync-app-spec.md/-evidence.md
- [x] **Share cards** (`feat/share-cards`): a session card (wordmark, date,
      discipline, weapon group/class, firearm, per-series totals + X count,
      average, X count, opt-in free-text note) and a per-series card (total,
      shot chips, X count, discipline, date), rendered as react-native-svg
      primitives (already a direct dependency — no new one) and rasterized
      to PNG on-device via that library's own `Svg.toDataURL()`, shared via
      `expo-sharing`. Always the Purple Rain palette regardless of the
      viewer's app theme; a preview screen shows exactly what will be shared
      before the share sheet opens. Never includes shooter identity or
      location. Entry points: a Share button on the session screen, a Share
      series button on the series entry screen once it has shots.
- [x] Encrypted on-device document vault (license, membership card, door
      codes) — never synced. `/vault`, reachable from Settings (not a tab);
      AES-256-GCM per file via `expo-crypto`, key in `expo-secure-store`
      (hardware-backed keystore/keychain); biometric/passcode gate via
      `expo-local-authentication`; Android auto-backup exclusion for the
      vault directory. See docs/specs/document-vault-spec.md/-evidence.md
- [x] **Scan a physical license card** (decided 2026-09-02, shipped in
      `feat/license-card-ocr`): the licence form's "Scan card" actions
      photograph (or pick) the vapenlicens card, run ML Kit text recognition
      on-device, and pre-fill license number, purpose, decided-on,
      valid-until / "tills vidare", conditions and authority — plus the
      firearm's make/model/caliber/vapen-id behind a separate opt-in switch.
      Every value lands in an editable input under a "recognition can be
      wrong" notice; the existing Save button is still the only writer.
      Parsing is pure and exhaustively tested
      (`shared/src/licenses/card-parser.ts`); the engine sits behind
      `app/src/platform/text-recognition.ts` (+ `.web.ts` stub). The photo is
      deleted as soon as its fate is known, or encrypted into the vault
      behind the vault's own biometric gate if the user asks. See
      `docs/specs/license-card-ocr-spec.md`/`-evidence.md`.
      **Limits:** only the Swedish Polisen layout (other jurisdictions stay a
      per-profile template later); Latin script only; a still photo, not a
      live camera scan. **Perspective correction was not reused** — the
      photo-scoring pipeline rectifies a _circular_ target face from an
      ellipse fit, so a rectangular card would need its own quadrilateral
      detection and homography; ML Kit tolerates moderate angles on its own,
      so the card is photographed flat instead.
- [ ] iOS release (camera feature as the launch hook)

### v3+ — by user demand

- [ ] Timers — three kinds behind one "Timer" entry (decided 2026-09-02):
  - [x] **Regular** — PAR/interval timer with ready delay, series, rest, and
        the milsnabb drill generated from the program definition
        (`feat/shot-timer`, `shared/src/timer/`).
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
  - [x] **IPSC-style shot timer** — "Are you ready?" / "Standby",
        random-delay start beep, then split (lap) times detected from the
        sound of the shots via the microphone; shows first-shot time, splits,
        total, shot count; sensitivity setting; PAR-time optional
        (`feat/ipsc-shot-timer`). Detection and the run state machine are
        pure (`shared/src/timer/shot-detector.ts`, unit-tested); the mic
        lives behind `app/src/platform/shot-listener.ts` (+ a web stub) on
        the already-present expo-audio — no new dependency. Reached as the
        second mode behind the Timer entry.
        **No recording is ever stored:** expo-audio has no meter-without-
        record mode, so a file must exist for `metering` to be populated —
        it is written to the OS cache directory, never read back, shared or
        synced, and deleted on stop.
        Limits, deliberately: the prompts are **text plus a tone, not
        spoken** (no TTS dependency in the lockfile — expo-speech is not
        installed; adding it needs the maintainer's OK); detection is a
        threshold on the recorder's ~60 ms peak metering plus an 80 ms
        debounce, so it cannot separate a genuine sub-80 ms double-tap, and
        the dB thresholds behind low/medium/high are sensible starting
        points, not measured against a real firing line; a full magazine of
        neighbouring shooters at the same bay will trigger it. Verified on
        the emulator only, which has no microphone — the permission flow,
        the start sequence, the beep and the stop/result path are exercised,
        the detection itself is not.
        **User-set trigger level** (`feat/shot-timer-trigger-level`): the
        low/medium/high presets are now starting points, not the only
        choice — the setup screen has a numeric dBFS trigger level
        (`shared/src/timer/shot-detector.ts`'s `thresholdDb`, `±2 dB` step
        buttons plus the three preset chips, clamped to
        `MIN_TRIGGER_DB..MAX_TRIGGER_DB` i.e. -60..0). A live level meter on
        the same screen — metering only, no `ShotDetector`/engine involved,
        `app/src/features/timer/use-level-meter.ts` — runs while mic
        permission is already granted and the setup screen is visible, so
        the shooter can clap/dry-fire and see the peak against the
        threshold line before a run; it stops (and the temp recording is
        deleted) the moment Start is pressed, the run finishes, or the
        screen is left, same guarantee as the run path. No settings store
        exists yet for the timer's other options (delay/PAR/auto-stop are
        component state too), so the trigger level is component state as
        well — not persisted across screens/restarts.
- [ ] Ammo performance comparison across lots
- [ ] Cross-session heatmaps, coaching hints
- [ ] GPS range auto-matching; Swedish range database
- [ ] Club/leaderboard features (only if a club asks)
- [ ] Watch app / widgets

## Architecture

**Local-first.** The device's SQLite database is the source of truth; the
app is fully functional with no account and no network. The cloud is an
optional backup/sync add-on (a Firebase replacement, inverted):

| Concern          | Choice                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | React Native + Expo, TypeScript                                                                                                                                                                                                                                                                                                              |
| Local DB         | SQLite (expo-sqlite — has web/WASM support, required by the agentic web loop) + Drizzle ORM                                                                                                                                                                                                                                                  |
| Migrations       | Drizzle Kit — schema in TS, versioned SQL migrations (Flyway-style journal), applied on-device at app start and to D1 via the same toolchain                                                                                                                                                                                                 |
| Camera / CV (v2) | react-native-fast-opencv (JSI) + expo-image-manipulator; capture via expo-image-picker. **VisionCamera not adopted**: v5 needs react-native-nitro-modules + react-native-nitro-image and dropped its Expo config plugin — three native modules for a still photo expo-image-picker already takes. Revisit for a live frame-processor preview |
| Sync API         | Cloudflare Workers (Hono), TypeScript shared types with the app                                                                                                                                                                                                                                                                              |
| Cloud DB         | Cloudflare D1                                                                                                                                                                                                                                                                                                                                |
| Photos           | Cloudflare R2 ($0 egress)                                                                                                                                                                                                                                                                                                                    |
| Auth (sync only) | better-auth on Workers/D1; Sign in with Apple + Google                                                                                                                                                                                                                                                                                       |
| Crash reporting  | Sentry (or none) — privacy-sensitive audience                                                                                                                                                                                                                                                                                                |

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
