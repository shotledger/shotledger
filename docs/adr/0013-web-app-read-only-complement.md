# ADR 0013: The web app is a separate read-only complement, not a third sync device

Status: proposed (2026-09-18)

## Context

Issue #277 asked whether a web app would help shooters who opt in to
Cloudflare sync. ADR 0012 answered the question it said everything depended
on: expo-sqlite's WASM build does run in a browser under
`web.output: "single"`, so **architecture A — the whole Expo app in the
browser as a third sync device — is technically viable.** ADR 0012 stopped
there deliberately; it settled a bundling question, not a product one.

On 2026-09-18 the maintainer settled the product question, and the answer
changes which architecture the viability result should be spent on:

> **The web app shall not have parity with the native app. The web app will
> be a complement.**

and named the feature set it is a complement of:

| Group                | Features                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Account and recovery | sign in; list signed-in devices and revoke; storage usage; download everything (sessions JSON + photos); delete account |
| Read-only viewing    | statistics; föreningsintyg activity-log print; browse sessions (list + detail); target photos side by side              |

and, explicitly, **no write paths at all for now.** Keyboard series entry,
bulk edit and editing account/compliance settings from the browser are
deferred to #301 and are not in scope here.

Two architectures remain on the table:

- **A — web as a third sync device.** The existing Expo app, built for web,
  with expo-sqlite in OPFS, the platform wrappers, the expo-sqlite pnpm
  patch and COOP/COEP at the edge (all per ADR 0012).
- **B — a separate read-only web app.** A small bundle served by the
  existing Worker that signs in with better-auth, reads the account's rows
  from the existing `POST /sync/pull` from cursor 0, renders them through
  `@shotledger/shared`, and writes nothing — no local SQLite, no OPFS, no
  platform wrappers, no expo-sqlite patch, no COOP/COEP.

## What `shared/` actually covers

This is the fact the decision turns on, so it is stated precisely rather
than as "`shared/` is pure TypeScript".

Every selected feature's _logic_ is already in `shared/`, as pure functions
over plain arrays, and neither architecture has an advantage there:

| Selected feature     | Reused unchanged                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- |
| Statistics           | `shared/src/scoring/analytics.ts`, `stats.ts`, `totals.ts`, `marke.ts`             |
| Föreningsintyg print | `shared/src/export/pdf-log.ts` (it emits **HTML**), `shared/src/compliance/*`      |
| Download everything  | `shared/src/json-export/export.ts` — the published `shotledger.sessions` envelope  |
| Browse sessions      | `shared/src/disciplines`, `firearms`, `locations`, `calibers`, `scoring/totals.ts` |
| Target photos        | `shared/src/sync-client/photo-uri.ts` to resolve a synced `series.photo_uri`       |

`pdf-log.ts` is the clearest case: it already returns an HTML string that
the app hands to `expo-print`. In a browser `window.print()` replaces
`expo-print`, so the föreningsintyg path is _better served_ on web than on
the phone, under either architecture, with zero new code in `shared/`.

What B does **not** get for free is the app-side glue that turns SQLite rows
into those functions' inputs — `app/src/db/queries/`. That glue is the
honest cost of B, so its size matters. The analytics one,
`app/src/db/queries/stats.ts`, is 72 lines whose entire strategy is:

> Loads every non-deleted session/series/shot once and joins in JS (three
> flat scans instead of an N+1 per-series query), matching `StatsSeries`
> exactly.

A `/sync/pull` response from cursor 0 _is_ those flat scans, already
decoded, already tombstone-tagged. Re-expressing that adapter over arrays
instead of Drizzle is on the order of fifty lines, not a re-implementation
of the data layer. The same is true of the session list and detail.

What B does not get at all is the React Native component tree, the theme
tokens, and the i18n wiring under `app/src`. That is the whole of B's
delta, and it is bounded by the six read-only screens above rather than by
the size of the phone app.

## Decision

**Architecture B.** Build a separate, read-only web app, served
same-origin by the existing Worker, reading through `/sync/pull` and
`/photos/:photoId`, holding nothing after the tab closes.

### Why, given "complement, not parity"

**1. A is parity by construction; the constraint is non-parity.** Under A
the deliverable is the phone app, and the selected feature set is reached
by _suppressing_ everything else. expo-router evaluates every route at
start-up — ADR 0012 hit exactly this, where one native-only import in
`session/[id]/scan.tsx` killed the whole web bundle — so every native
module and every write screen needs a web stub or a web guard, and needs
one again each time a new one is added. That is permanent negative work
whose size tracks the phone app, not the web feature set. B's upkeep
tracks the sync protocol, which is versioned and already guarded
(ADR 0003), and the shape of six screens.

**2. A's central advantage is a write path the maintainer has deferred.**
Web-as-a-third-device is worth its cost when the browser writes: the
outbox, the triggers and ADR 0003's guardrails come along, and keyboard
entry and bulk edit are nearly free. With writes deferred (#301), A is
being bought for a capability that is by decision not going to be used.
If #301 is later approved, this ADR is what gets revisited — see
Consequences.

**3. A makes the browser a data-bearing surface for no gain here.** Under
A the full logbook is copied into OPFS on every machine the shooter signs
in from — possibly a shared or family PC — where it is per-origin,
best-effort and evictable (ADR 0012). Target photos and license records
are personal data under hard rule 7, and the manual's privacy table rests
on "nothing is uploaded unless you deliberately turn something on". A
read-through viewer that keeps nothing is the strictly smaller data
surface, and it is the one that keeps that sentence true without
qualification. It also removes the "a cleared site is a wiped logbook"
confusion ADR 0012 had to write down.

**4. `shared/` makes B cheap in exactly the places that matter, and the
non-reusable part is small and measured** (see above). The estimate in
#277's original analysis — that B is "cheapest for read-only pages" but
"nothing it builds helps the phone" — was made against an assumed future
of write paths and parity. With those removed, "nothing it builds helps
the phone" is no longer a cost: nothing it builds _needs_ to.

### Where this disagrees with what came before

#277's own analysis recommended "spike A before choosing; if A passes, B
should never be built." The spike passed. This ADR nonetheless chooses B —
because the spike settled _feasibility_, and the maintainer's 2026-09-18
decision changed the _requirement_ the feasibility was being measured
against. A remains the right answer to the question #277 was asking in
September, which was a question about a web app with write paths and
eventual parity. It is the wrong answer to "complement, not parity".

ADR 0012's kept artifacts are not wasted by this. `web.output: "single"`,
`app/metro.config.js`, `client.web.ts`, the `MigrationGate`, the OpenCV
stub and the `expo-sqlite@57.0.3` patch remain justified by the reason
ADR 0001 chose expo-sqlite in the first place and `docs/architecture.md`
still gives — **the agentic web preview loop**, which is a development
surface, not a product. This ADR neither keeps nor drops them; it removes
the _product_ argument for them, so if the preview loop ever stops needing
a working database in the browser, the patch and the COOP/COEP requirement
become removable with nothing else depending on them.

## Blockers, per selected feature

These hold whichever architecture is chosen, unless stated. All verified
against the tree at `b4331b1`.

**Sign in.** `backend/src/auth/better-auth.ts` configures better-auth 1.7.5
with `emailAndPassword: { enabled: true }` and the `bearer()` plugin and
nothing else: no `sendResetPassword`, no `emailVerification`, no social
provider, no `trustedOrigins`. **Password reset therefore needs an outbound
email provider** — a dependency decision under hard rule 2, and a DNS
decision besides. A public sign-in page without password reset is a support
burden that falls on one maintainer. _Also, not previously noted:_ there is
no CORS middleware anywhere in `backend/src`, so the web app must be served
**same-origin from the Worker**, or CORS and `trustedOrigins` must be added
and tested.

**Devices list and revoke.** Not blocked, but not free either. ShotLedger
has no such route; better-auth's own `list-sessions` / `revoke-session`
endpoints are reachable through the `/api/auth/*` mount in
`backend/src/index.ts`, and nothing in the repo calls or tests them. Treat
as unbuilt, not as existing.

**Storage usage.** `GET /photos/usage` exists and is authenticated. No
blocker.

**Download everything.** Sessions JSON is unblocked (`json-export`).
Photos are not: `GET /photos/:photoId` serves one object at a time and
there is no bulk or archive endpoint, and because the route is behind the
bearer authenticator, neither `<img src>` nor `<a download>` works — the
page must `fetch()` each photo with the Authorization header and either
render it from a blob URL or zip it client-side. A shooter with hundreds
of target photos makes that a real design question, not a detail.

**Delete account.** `POST /account/delete` exists with the `dryRun`
preview. No blocker.

**Statistics.** Logic fully reusable. **Blocked in one dimension:**
`session_tags` is not in `SYNC_TABLE_NAMES` (`shared/src/sync/protocol.ts`),
a deliberate deviation that `docs/specs/sync-protocol-spec.md` §1 records
with its own open **VERIFY with the maintainer**. `app/src/db/queries/stats.ts`
reads that table to populate `AnalyticsSeries.tagIds`, so **the analytics
report's tag filter cannot work on web under either architecture** until
that VERIFY is settled and, if the answer is yes, the table joins the
protocol. `settings` is excluded for the same reason, so no user preference
carries to the browser. This is a larger gap for the selected feature set
than the `shot_marks` one below, and #277 did not call it a blocker.

**Föreningsintyg activity-log print.** _The stated blocker is out of date._
The FAP 551-3 values are **no longer VERIFY**:
`shared/src/compliance/constants-se.ts` sets `SE_VERIFIED = true` and cites
"PM 551.24 Föreningsintyg s. 3 — PMFS 2016:4 / RPSFS 2009:13, FAP 551-3,
5 kap 5–6 §§", and `constants-se.test.ts` asserts that citation contains no
`VERIFY`. What is still open is narrower and different: the **layout**
VERIFY at `shared/src/export/pdf-log.ts:5` — the table has never been
compared against a real föreningsintyg attachment — and one residual
placeholder at `shared/src/compliance/indicators.ts:33` ("≥1 guldserie in
24 months" is a proxy, not a rule). So the print is blocked on a layout
check, not on the numbers.

**Browse sessions (list + detail).** Structurally unblocked; the
`session_tags` / `settings` gap above surfaces here too, as a session
detail that cannot show its tags.

**Target photos side by side.** _The stated blocker is right but
narrower than stated._ Viewing the photos is **not** blocked: once a photo
is uploaded, `series.photo_uri` holds `shotledger-photo:<photoId>`
(`shared/src/sync-client/photo-uri.ts`), `series` is in
`SYNC_TABLE_NAMES`, and `GET /photos/:photoId` serves the object — so
side-by-side viewing works off today's protocol. What is blocked is
**marks overlaid on the photo**: `shot_marks` exists only at
`app/src/db/schema.ts:219` and is absent from `SYNC_TABLE_NAMES`, so
adding it is a protocol bump and sync-engine work, which means the
old-coder loop.

**Hosting at all.** The app is AGPL-3.0-or-later (ADR 0017, formerly
ADR 0004). A hosted web app is network use under §13, which obliges offering
the Corresponding Source from the page itself. **The repo must be public
before the web app is deployed.** Confirmed as stated.

## Consequences

- A second UI surface exists, and its boundary is this ADR's feature table.
  Anything outside it is a new decision, not an increment.
- `scripts/i18n-check.mjs` requires every key in `app/src/i18n/{en,sv}.json`
  to be referenced under `app/src`. A second root means teaching that gate
  about it, or giving the web app its own key namespace. One-time, small,
  and it must not be loosened.
- The web app should import the existing i18n JSON and design tokens rather
  than restating them; that is what keeps "second surface" from meaning
  "second vocabulary". It is a build-time file import, not a dependency on
  React Native.
- The web app never writes. That is an invariant to test for, not a
  convention: it holds no outbox, and none of ADR 0003's guardrails are
  re-implemented in a browser.
- Offline does not apply. The web app requires the network by definition;
  PRODUCT principle 3 ("sync is an option, never a precondition") is
  preserved because the web app is never the only way to do anything — the
  phone remains complete without it.
- **When this gets revisited:** if #301's write paths are approved, the
  choice is between adding narrow write endpoints to the Worker and
  reopening architecture A. Do not add a write path to the B web app by
  re-implementing the outbox in a browser; that is the case in which A
  wins, and this ADR should be superseded rather than stretched.
- Providers (ADR 0010) stay native-only on every surface: a browser cannot
  reach webshooter.se cross-origin, and a Worker proxy would break the
  privacy table's "never through any ShotLedger server".
