# Architecture

How ShotLedger is built and why. This file states what holds today; when a
change alters one of these decisions, it updates this file in the same pull
request. Each section ends with what was **rejected**, so a settled question is
not reopened without a new reason. Git keeps the history.

Related: [`REGULATIONS.md`](REGULATIONS.md) (how rule books become code) and
[`app/PRODUCT.md`](app/PRODUCT.md) (what and why, for users). A new dependency
needs the maintainer's approval (AGENTS.md hard rule 2); its reasoning goes in
the PR that adds it, and a rejection worth remembering goes here.

## Stack

| Concern                  | Choice                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                      | React Native + Expo, TypeScript                                                                                                                                       |
| Local DB                 | SQLite (`expo-sqlite`, chosen over op-sqlite for its web/WASM support, which the web preview needs) + Drizzle ORM                                                     |
| Migrations               | Drizzle Kit on the device (schema in TS, versioned SQL, applied at app start); D1 uses hand-written SQL in `backend/migrations/`, kept in step with `SYNC_MIGRATIONS` |
| Camera / computer vision | `react-native-fast-opencv` (JSI) + `expo-image-manipulator`; capture via `expo-image-picker`                                                                          |
| Sync API                 | Cloudflare Workers (Hono), TypeScript shared with the app                                                                                                             |
| Cloud DB                 | Cloudflare D1                                                                                                                                                         |
| Photos                   | Cloudflare R2 ($0 egress)                                                                                                                                             |
| Auth (sync only)         | `better-auth` on Workers/D1; opt-in email+password (bearer plugin) and passkeys; no social provider                                                                   |
| Web app                  | Vite + React, served same-origin by the Worker                                                                                                                        |
| JS updates               | EAS Update (`expo-updates`), `appVersion` runtime, a channel per distributable build profile                                                                          |
| Crash reporting          | None yet; Sentry is the candidate, weighed against a privacy-sensitive audience                                                                                       |

## Local-first

The device's SQLite database is the source of truth. The app is fully functional
with no account and no network; cloud sync is an optional add-on. The reasons:
shooters log at ranges with poor signal, the audience is privacy-sensitive (no
forced accounts), and the budget is donation-scale.

- Every table carries `id` (UUIDv7), `created_at`, `updated_at` and `deleted_at`
  from day one. All deletes are soft; queries filter tombstones.
- Derived values (totals, statistics) are computed, never stored.
- Backend cost stays around $0–5/month up to ~5k users, with no vendor SDK.
- Multi-user collaboration on shared records is out of scope by design.

**Dates and times.** Every datetime is stored as UTC (`toISOString()`) and
converted to the phone's time zone only where a user sees or picks a day, month
or year. Never take a day by slicing an ISO string, which gives the UTC day. Use
`shared/src/dates/`, which the app reaches through
`app/src/features/dates/local-day.ts`.

Rejected: Firebase-style cloud-first backends (they invert all three reasons).

## Sessions and series

Series counts are never fixed for freeform programs. Real SPSF precision matches
vary (≥6 series ordinary, 7+3 at championships, SHB C.3.6.1.1), and rigid
skeletons fight how shooters log.

- Structure lives on the series rows: `is_sighter` (at most one per section in a
  freeform session, matching SHB's one provskott series per round) and
  `is_final`. With finals, three results are derived: `beforeFinal`,
  `finalScore`, `total`; standardmedalj evaluates `beforeFinal` (SHB C.5.1.1.4).
- Programs are presets (default shots/series, scoring mode, `supportsFinal`)
  stored as JSON data, addable by PR without a migration.
- Only fixed-format programs (milsnabb: 1 provserie + 4×10 s + 4×8 s + 4×6 s,
  SHB J.6.1; Nationell helmatch) declare a `structure` and pre-create their
  skeleton. Its groups carry their own `sighterSeries` and optional `targetFace`
  (helmatch needs a sighter before two of three delmoment and a different face
  for each, SHB I.6.1, I.6.6.2). A fixed-format session takes its skeleton as
  the truth; a series resolves its group, time limit and face by position.
- Fält is stations, not series; see [`REGULATIONS.md`](REGULATIONS.md), "Scoring
  models".

Rejected: programs with fixed stage/series counts (6/7/10 series).

## Sync

Opt-in, per user, built in-house: a changelog protocol on Cloudflare Workers +
D1, photos to R2. The server side is described in
[`docs/sync-backend.md`](docs/sync-backend.md); the protocol is specified in
`docs/specs/sync-protocol-spec.md` (evidence-first, like all sync-engine code).

Every row carries `updated_at` and a `deleted_at` tombstone. The client pushes
local changes, pulls server changes since its cursor, and conflicts resolve
last-write-wins per row. That is safe because a user only ever edits their own
data: one user, a few devices, no CRDT engine.

**Protocol guardrails** (from documented real-world failures):

- Merge ordering uses server-assigned order (`seq`), never client clocks.
- Tombstone wins on conflict: explicit precedence, not `max(updated_at)`.
- A local write and its outbox entry happen in one SQLite transaction.
- A strict `pull → push → ack` cycle; no concurrent independent loops.
- Tombstone retention is longer than the longest supported offline window.
- Catch-up sync paginates by cursor.
- A client older than the server's minimum supported protocol version must
  upgrade before syncing.

**Photo policy.** The client resizes before upload (~2048 px JPEG, ≈300–600 KB,
plus a thumbnail); originals never leave the device. The server enforces a
maximum object size (~1.5 MB), a per-user quota (initially 1 GB) and an upload
rate limit (initially 60/hour, a D1 fixed-window counter in
`backend/src/lib/rate-limiter-d1.ts`; the Workers rate-limiting binding has no
test simulator, so it is not used). Quotas are tracked in D1; nothing is deleted
server-side without user action. `backend/src/config.ts` implements these
values, marked `VERIFY:` as a starting point rather than a measurement. The sync
session token lives in `expo-secure-store`, never in the database.

**Schema in the protocol.** The Drizzle tables live in
`shared/src/sync/schema.ts`, re-exported by `app/src/db/schema.ts`, because
their columns are the wire format. `/sync/push` refuses a row a device could not
apply by checking it against a schema derived from the table with `drizzle-zod`
(`docs/specs/sync-payload-validation-spec.md`). The Worker imports
`shared/src/sync/` only, plus `payload-schemas`, which stays out of the sync
barrel and so out of the app and web bundles. ESLint enforces the import rules
for package specifiers (`eslint.config.mjs`); the licensing reason, and the
bundle check that also catches relative imports, are in
[`CONTRIBUTING.md`](CONTRIBUTING.md#why-the-license-map-looks-like-this).
`schema.ts` is table declarations only, so it is left out of the mutation list
and the 100% coverage gate; drizzle-kit and the app's migration tests check it.

**What syncs.** Exactly the tables in `SYNC_TABLE_NAMES`
(`shared/src/sync/protocol.ts`), an allowlist. `shot_marks` and
`training_samples` stay on the device on purpose: target photos and what is
derived from them are personal data with nowhere off-device they may go
(AGENTS.md hard rule 7). The sync bookkeeping tables (`sync_outbox`,
`sync_state`, `sync_control`, `photo_queue`) are device-local by nature.

- `session_tags` gives each link its own id. Unlink is a tombstone, and a
  tombstone is terminal for its id, so re-linking writes a new row. There is no
  unique constraint over the pair: readers dedupe, and a concurrent link and
  unlink resolve add-wins.
- `settings` syncs only the keys in `SYNCED_SETTING_KEYS`, which is
  authoritative: the account and compliance settings plus the `show*` feature
  switches. A synced setting is one row whose id is the key, never tombstoned;
  clearing writes `null`. Every other key is device-local: the app's triggers
  skip it, the server refuses it and the apply step drops it.
- Tag names are not unique on disk. Two devices creating "KM" offline give two
  rows, and readers resolve a name to its earliest live tag
  (`shared/src/tags/canonical.ts`). The copies stay on disk until a merge edit
  repoints their links and tombstones the copy.

Rejected: every surveyed sync library (2026-09). PowerSync, ElectricSQL and Zero
need a Postgres/MySQL/Mongo source, with no D1 path. Turso keeps the client but
replaces D1 (and its offline writes were beta). LiveStore, TinyBase,
WatermelonDB, Evolu, Triplit, InstantDB and Jazz replace the Drizzle schema with
their own model. Replicache was archived, SQLSync is "not for production",
others were pre-1.0 or lost their teams. These libraries solve multi-writer
conflicts that do not exist here. Revisit only if Turso's offline writes leave
beta **and** the Cloudflare-only constraint is relaxed.

## Backup bundles

A `.shotledger` bundle is a small hand-rolled, uncompressed container
(`shared/src/backup/container.ts`): a magic header and length-prefixed entries,
with its own `BACKUP_CONTAINER_FORMAT_VERSION`. The behavior is in
`docs/specs/backup-export-spec.md`.

- Export `VACUUM INTO`s a temporary copy (never the live file), rewrites that
  copy's `series.photo_uri` to the bundle-relative `photos/<id>.<ext>`, counts
  rows for the manifest and serializes the copy.
- Restore is a full replace: an automatic pre-restore backup, close the live
  connection, overwrite the file, restore photos into
  `Paths.document/backup-photos/`, rewrite their paths, then reload the JS app
  (`reloadAppAsync`, behind `app/src/platform/app-reload.ts`), since the app
  cannot reopen its own closed database singleton in place.
- The manifest records the last Drizzle journal entry's tag and `when`; restore
  refuses a bundle unless both match the running build
  (`shared/src/backup/compat.ts`).
- Restore refuses a bundle before writing anything unless every `photos/` and
  `sync-photos/` entry is a plain `<id>.<ext>`; the container rejects empty or
  duplicate names and trailing bytes.

Bundles are uncompressed, so size tracks photo count. Rejected: zip (no zip
library was approved; revisit if one is).

## Web app

A separate web app (`web/`), served same-origin by the Worker, for users who opt
in to sync. It reads the account's rows through `POST /sync/pull` and
`/photos/:photoId`, renders them through `@shotledger/shared`, and keeps nothing
after the tab closes: no SQLite, no OPFS, the token in `sessionStorage`, rows in
memory.

- **Writes** push whole changed rows through the existing `/sync/push`, online
  only: no browser database, no outbox, no retry from storage. To the server the
  web is one more device, with the same server-order LWW per row. A push
  replaces a whole row, so the web pulls, edits the payload and pushes full
  rows, parents before children. A `tombstoned` ack means another device deleted
  the row; the web re-pulls rather than retrying.
- **Parity.** Where the web reads or writes something the phone also handles, it
  does what the phone does (`app/PRODUCT.md` principle 5, AGENTS.md rule 11).
  The phone stays complete without the web.
- **Races** are those of two phones, and are accepted as such:
  - The later push wins the whole row, so a phone that edited a session offline
    can overwrite a web bulk edit of that session's other fields.
  - A web edit that fails in flight is lost with the tab; the user redoes it.
  - Keyboard entry moves a firearm's round counter by rewriting the firearm row,
    stamped with the browser's clock in `updated_at`. Server order, not that
    timestamp, decides the winner, so a wrong browser clock only shows as a
    wrong edit time. A phone's increment between the web's pull and push can be
    lost until corrected.
  - An ammo-lot merge repoints every session on the duplicate, then tombstones
    it. A device that saves a session on the duplicate before it pulls the merge
    wins that row, so the session names a tombstoned lot and shows none until
    the user picks one. Nothing records which lot a duplicate went into, so
    neither case is repaired automatically.
- It imports the app's i18n JSON and design tokens at build time rather than
  restating them; `scripts/i18n-check.mjs` counts `web/src` as a source, and
  that gate must not be loosened for it.

How a web edit becomes pushed rows:

| Web action                       | Rows pushed                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Retag sessions                   | a new `session_tags` row per added link; a tombstone per removed link id                               |
| Fix a firearm link over a season | each affected `sessions` row, and each affected `firearms` row with its round counters moved           |
| Merge duplicate ammo lots        | every `sessions` row on the duplicate repointed to the kept lot, then the duplicate tombstoned         |
| Move sessions between locations  | each `sessions` row with the new `location`                                                            |
| Edit account/compliance settings | one `settings` row per changed key                                                                     |
| Keyboard series entry            | new `sessions`, `series` and `shots` rows, and the chosen `firearms` row with its round counters moved |

- Providers (external sites) stay phone-only: a browser cannot reach them
  cross-origin, and a Worker proxy would break "never through any ShotLedger
  server".

Rejected: the Expo app built for web as a third sync device (OPFS database,
platform stubs, COOP/COEP at the edge). It copies the whole logbook into
evictable browser storage on every machine signed in from, and every native
module and screen needs a web stub. Do not add a browser outbox to the web app;
if offline web writes are ever wanted, that is the case for the Expo-web route
and a new decision.

### Web preview (development only)

The Expo app still runs in a browser for the agentic preview loop, with the real
expo-sqlite in OPFS. That needs `web.output: "single"` (`app/app.json`) with
`wasm` in Metro's `assetExts`; a cross-origin-isolated page (COOP `same-origin`,
COEP `credentialless`), which Metro cannot send, so a proxy adds them
(`.claude/skills/run-app/scripts/coi-proxy.mjs`); an async open in the web
`MigrationGate`; a throwing OpenCV stub (`opencv.web.ts`); and
`patches/expo-sqlite@57.0.3.patch` (expo/expo#44148, drop when a release carries
the fix). If the preview stops needing a browser database, all of this can go.

## External sites

An external site (WebShooter today) is a **provider**: a descriptor that
declares capabilities (`importResults`, `myStarts`, `stats`, …) plus an
implementation of those. The registry is `shared/src/integrations/providers/`.

- The UI renders from the declaration, so an unsupported feature is absent, not
  a button that fails.
- Enabling (the shooter wants it) and connecting (credentials accepted) are
  separate, both in Settings per provider. Tools shows a provider only when
  enabled.
- Credentials are per provider in `expo-secure-store`: never in the database,
  never synced, never shared between providers.
- A second provider is a descriptor plus an implementation, not a refactor.

Rejected: one interface with optional methods (an unsupported feature becomes a
runtime error); a plugin system (providers are compiled in and reviewed like any
other code).

## Over-the-air updates

JS-only changes reach installed EAS builds through EAS Update; anything native
still needs a release. `runtimeVersion` uses the `appVersion` policy, so an
update reaches only builds of the same release, and every native change ships in
a release. One channel per distributable build profile (`preview`,
`production`); `simulator` has none. An update applies on the next launch after
it downloads; launch never waits on the network. Publishing runs from `hotfix/*`
or `release/*` behind the `release` environment; the steps are in
[`docs/release.md`](docs/release.md). Locally built APKs carry no channel and
receive no updates.

Rejected: the `fingerprint` runtime policy (it hashes the app config, stamped
version included, so it gains nothing over `appVersion` here).

## Photo scoring (computer vision)

The app scores a target from a photo by finding the face and the holes with
OpenCV. The tools that measure that code on real photos are TypeScript in
[`tools/cv/`](tools/cv/README.md), run on OpenCV.js in Node through the same
`DiscOps` seam the phone fills from react-native-fast-opencv, so a measurement
runs the code that ships. The fixtures are snapshots of the TypeScript, so a
wrong change regenerated into a fixture passes: review the fixture diff and
compare `eval/` runs on real photos before and after (`tools/cv/eval/diff.mts`).
Why the app's disc lock and the hole-filter refit differ from the retired Python
is in `tools/cv/README.md`.

**Scan speed.** Every precision guard runs before the marking screen opens. A
speed-up goes into the detector and must leave its candidates and verdicts
unchanged on the corpus (`guards.eval.ts`, `isDeepStrictEqual` against `main`).
`EXPO_PUBLIC_SCAN_TIMING=1` logs each stage on a phone. The measurements are in
`docs/specs/cv-closeup-lock-2026-09.md` and on #648.

Rejected: the Python spike as a second implementation (retired 2026-10-03,
recoverable from git); dropping or crop-gating the hole-size check (it catches 3
of 66 milsnabb photos the other guards miss); a smaller detector canvas (changes
candidates on 68 of 85 corpus canvases); opening the marking screen before the
guards' verdict (saves ~1–2 s for a late-refusal flow); VisionCamera (three
native modules for what a still photo already covers; revisit for a live
frame-processor preview).

## Other dependency choices

- **License-card OCR** runs Google ML Kit text recognition on-device
  (`@react-native-ml-kit/text-recognition`, behind
  `app/src/platform/text-recognition.ts`), with no network call. Rejected: any
  cloud OCR API; `react-native-mlkit-ocr` (unmaintained). It is a
  legacy-architecture module on RN's interop layer: the risk to watch.
- **Range lookup** asks OpenStreetMap's Overpass API for nearby ranges with a
  one-shot position (`expo-location`, no background permission, coordinates
  never stored), behind the `onlineLocationLookup` setting, off by default.
  Rejected: a bundled Swedish range list (a stale list that names the wrong club
  is worse than none).
- **Passkeys** use better-auth's own plugin on the Worker,
  `@simplewebauthn/browser` on the web and `react-native-passkey` on the phone
  (behind `app/src/platform/passkey.ts`). Rejected: better-auth's
  `passkeyClient` on the web (pulls in a second HTTP client); a hand-rolled
  WebAuthn verifier; a hand-written Expo module.
- **Tests** use `@testing-library/react-native` 14 on `test-renderer`. Rejected:
  `react-test-renderer` (deprecated under React 19).
- **E2E** runs Maestro on an emulator in CI on pushes to `main` that touch the
  app and on PRs labelled `e2e`. Rejected: every ready PR (15–25 extra minutes
  each).

## iOS readiness

Android ships first; every PR stays iOS-compatible.

- Only cross-platform Expo/RN modules unless unavoidable; platform-specific code
  goes behind a small wrapper in `app/src/platform/`.
- No Android-only UI assumptions: back button and FAB conventions are fine,
  hard-coded intents are not.
- CI runs on Linux and does not compile iOS. An iOS simulator build runs on EAS
  from the manual _iOS build_ workflow (`docs/release.md`, iOS).
