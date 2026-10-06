# ADR 0013: The web app is a separate read-only complement, not a third sync device

Status: accepted (2026-10-06; proposed 2026-09-18)

## Context

Issue #277 asked whether a web app would help shooters who opt in to
Cloudflare sync. ADR 0012 showed that the whole Expo app, expo-sqlite
included, can run in a browser. On 2026-09-18 the maintainer settled the
product question:

> **The web app shall not have parity with the native app. The web app will
> be a complement.**

The feature set it complements:

| Group                | Features                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Account and recovery | sign in; list signed-in devices and revoke; storage usage; download everything (sessions JSON + photos); delete account |
| Read-only viewing    | statistics; föreningsintyg activity-log print; browse sessions (list + detail); target photos side by side              |

There are **no write paths for now**; keyboard entry, bulk edit and editing
settings from the browser are deferred to #301.

Two architectures were on the table:

- **A — web as a third sync device.** The existing Expo app built for web,
  with expo-sqlite in OPFS, the platform wrappers, the expo-sqlite patch and
  COOP/COEP at the edge (ADR 0012).
- **B — a separate read-only web app.** A small bundle served by the existing
  Worker that signs in with better-auth, reads the account's rows from
  `POST /sync/pull` from cursor 0, renders them through `@shotledger/shared`,
  and writes nothing.

## Decision

**Architecture B.** A separate, read-only web app, served same-origin by the
existing Worker, reading through `/sync/pull` and `/photos/:photoId`, holding
nothing after the tab closes.

1. **A is parity by construction; the requirement is non-parity.** Under A
   the selected feature set is reached by suppressing the rest of the phone
   app: expo-router evaluates every route at start, so every native module and
   write screen needs a web stub or guard, again each time one is added. B's
   upkeep tracks the versioned sync protocol and six screens.
2. **A's main advantage is a write path that is deferred.** Web as a third
   device pays off when the browser writes (outbox, ADR 0003's guardrails).
   With writes deferred, A buys a capability that will not be used.
3. **A makes the browser a data-bearing surface for no gain.** It copies the
   whole logbook, photos and license records included, into evictable OPFS on
   every machine signed in from, possibly a shared one. A viewer that keeps
   nothing keeps the manual's privacy promise without qualification.
4. **B is cheap where it matters.** Every selected feature's logic is already
   pure functions in `shared/`; `pdf-log.ts` already emits HTML, so
   `window.print()` serves the föreningsintyg print. What B rewrites is the
   `app/src/db/queries/` glue over `/sync/pull` arrays — on the order of fifty
   lines per adapter — and six read-only screens.

What each feature is still blocked on is tracked on #277.

## Consequences

- A second UI surface exists, and its boundary is the feature table above.
  Anything outside it is a new decision, not an increment.
- `scripts/i18n-check.mjs` requires every key in `app/src/i18n/{en,sv}.json`
  to be referenced under `app/src`. A second root means teaching that gate
  about it, or giving the web app its own key namespace. It must not be
  loosened.
- The web app imports the existing i18n JSON and design tokens rather than
  restating them — a build-time file import, not a dependency on React Native.
- The web app never writes. That is an invariant to test for: it holds no
  outbox, and none of ADR 0003's guardrails are re-implemented in a browser.
- Offline does not apply; the phone remains complete without the web app, so
  "sync is an option, never a precondition" still holds.
- **When this gets revisited:** if #301's write paths are approved, the choice
  is between narrow write endpoints on the Worker and reopening architecture
  A. Do not re-implement the outbox in the B web app; that is the case in
  which A wins, and this ADR should be superseded rather than stretched.
- Providers (ADR 0010) stay native-only on every surface: a browser cannot
  reach webshooter.se cross-origin, and a Worker proxy would break the
  privacy table's "never through any ShotLedger server".
