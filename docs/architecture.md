# Architecture

**Local-first.** The device's SQLite database is the source of truth; the
app is fully functional with no account and no network. The cloud is an
optional backup/sync add-on — see ADR 0001 for why, and its
consequences.

| Concern          | Choice                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | React Native + Expo, TypeScript                                                                                                                     |
| Local DB         | SQLite (`expo-sqlite` — chosen for its web/WASM support, which the agentic web preview loop requires) + Drizzle ORM                                 |
| Migrations       | Drizzle Kit — schema in TS, versioned SQL migrations (Flyway-style journal), applied on-device at app start and to D1 via the same toolchain        |
| Camera / CV (v2) | `react-native-fast-opencv` (JSI) + `expo-image-manipulator`; capture via `expo-image-picker`. VisionCamera deliberately not adopted — see ADR 0009. |
| Sync API         | Cloudflare Workers (Hono), TypeScript shared types with the app                                                                                     |
| Cloud DB         | Cloudflare D1                                                                                                                                       |
| Photos           | Cloudflare R2 ($0 egress)                                                                                                                           |
| Auth (sync only) | `better-auth` on Workers/D1; opt-in email+password (bearer plugin) — no social provider is configured                                               |
| JS updates       | EAS Update (`expo-updates`), `appVersion` runtime, a channel per build profile — ADR 0020                                                           |
| Crash reporting  | Sentry (or none) — privacy-sensitive audience                                                                                                       |

**Sync protocol** (opt-in): a per-user changelog. Every row carries
`updated_at`; deletions are tombstones. The client pushes local changes,
pulls server changes since the last sync, and resolves conflicts
last-write-wins per row (safe here because a user only ever edits their
own data — no CRDT engine needed). The full evaluation of why this was
built rather than adopting an existing sync library, plus the protocol's
guardrails and photo policy, is ADR 0003.

**Dates and times**: every datetime is stored as UTC (`toISOString()`), and
converted to the phone's time zone only where a user sees or picks a day,
month or year. Never take a day by slicing an ISO string, which gives the UTC
day. Use `shared/src/dates/`, which the app reaches through
`app/src/features/dates/local-day.ts`.

**iOS-readiness rules**, enforced from the first PR even though Android
ships first:

- Only cross-platform Expo/RN modules unless unavoidable; any
  platform-specific code goes behind a small wrapper module
  (`app/src/platform/`).
- No Android-only UI assumptions — the back button and FAB conventions
  are fine, hard-coded intents are not.
- CI runs on Linux only and does not compile iOS. An iOS simulator build
  runs on EAS from the manual _iOS build_ workflow (`docs/release.md`, iOS).

## Related ADRs

- **ADR 0001** — local-first SQLite with optional Cloudflare sync, and
  why (offline-first audience, donation-scale budget, no vendor lock-in).
- **ADR 0002** — freeform series with per-series flags, not fixed
  program stages.
- **ADR 0003** — building the sync engine ourselves rather than adopting
  a library, with the full survey of what was evaluated and rejected.
- **ADR 0009** — the running register of approved dependencies and
  rejected alternatives, including the camera/CV choice above.
- **ADR 0020** — over-the-air JS updates through EAS Update, and why the
  runtime version is the app version.
