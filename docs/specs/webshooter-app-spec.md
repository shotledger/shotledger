# Webshooter app integration — spec amendment

> Amendment to `docs/specs/webshooter-integration-spec.md` (v2, THE spec)
> and `docs/specs/webshooter-core-spec.md`, covering the app-side pieces
> those two leave unspecified: the `shared/src/scoring` read-path change
> for series-total-override (WS1), and the UI/persistence wiring
> (settings, import, starts/calendar, PB screen, session-detail badge).
> Old-coder discipline applies to WS1 (`shared/src/scoring/**`); the UI/DB
> query layer uses normal tests per CLAUDE.md.

## WS1 — series-total-override read path (`shared/src/scoring/{totals,stats}.ts`)

Per integration spec §1/§A.4: a Webshooter-imported series carries a
_total_ with no per-shot detail (`series.is_total_override=1`,
`total_override_tenths`, `total_override_shot_count`; no child `shots`
rows). Every v1 read path that summed `shots` to derive a series total
must branch. Both scoring modules gained an optional
`totalOverride?: { tenths: number; shotCount: number } | null` field on
their series-shaped input type (`SeriesForResults` in `totals.ts`,
`StatsSeries` in `stats.ts`) rather than a new parallel type — same shape
either place, so a caller (the DB query layer, later) constructs one
object per series regardless of which module consumes it.

**Series-level metrics — include, using the stored total:**

- `totals.ts`: `sessionResults` (beforeFinal/final/total),
  `seriesAverageTenths`.
- `stats.ts`: `bestWorstSeries`.

**Volume metrics — include, using the stored shot count (not
`shots.length`, which is always 0):**

- `totals.ts`: `shotVolume`.
- `stats.ts`: `volumeShotCount`.

**Per-shot metrics — exclude, with no code change needed:** every
function that pools or means individual `shots`/`StatsShot` values
(`sumValueTenths`-derived per-shot stats, `meanTenths`,
`sampleStandardDeviationTenths`, `xCount`/`xRate`, `scoredShots`,
`sessionTrend`, `compareRecentSeries`, `guldserieCount`,
`sessionInnerTenCount`) already excludes an override series correctly,
because such a series' `shots` array is always empty — there is no
shot-level data to guess at, so these functions are deliberately left
unbranched rather than given a redundant `if (totalOverride)` guard that
would just mean "produce the same empty-input result a different way."
`guldserieCount` in particular must never attempt to award märke to an
override series from its total alone — märke thresholds are keyed to a
specific series length with per-shot precision (spsf-domain skill), which
an override series does not have; the official `official_standardmedalj`
column (integration spec §A.5) is the authoritative medal for such a
session, shown alongside, never merged into, this computed indicator.

Tests: `shared/src/scoring/totals.test.ts` (`WS1:` cases under
`sessionResults`, `shotVolume`, `seriesAverageTenths`),
`shared/src/scoring/stats.test.ts` (`WS1:` cases under `bestWorstSeries`,
sighter-exclusion block for `volumeShotCount`). `pnpm coverage`'s 100%
threshold on `shared/src/scoring/**` still holds with these branches
added. Full `pnpm mutation` (Stryker) was not re-run for this change in
this session for time — recommended before merge, same as any other
`shared/scoring` edit per CLAUDE.md.

## App-layer scope (normal-tests discipline)

Everything below is new code under `app/src/`, tested through the query
layer with synthetic fixtures (never live Webshooter calls, never
personal data from `~/.cache/webshooter`):

- `app/src/db/queries/webshooter.ts` — import write path: exact/heuristic
  reconciliation against `sessions`/`series`, insert-with-override-series,
  field-level merge on re-import (score fields overwritten, enrichment
  fields only filled when empty), `extra_rounds` sighter-suggestion
  increment. Wraps `shared/src/integrations/webshooter/{reconcile,mapping}.ts`.
- `app/src/features/webshooter/` — settings connect/disconnect flow
  (expo-secure-store), import browse/review screens, "My starts" +
  expo-calendar export, dev-mode fixture injection for the Webshooter
  client interface.
- `app/src/app/webshooter/import/*`, `app/src/app/webshooter/starts.tsx`,
  `app/src/app/stats/records.tsx` — new routes (expo-router file
  convention, one folder per feature).
- `app/src/app/session/[id]/index.tsx` — ONE isolated component insertion
  (`<WebshooterSessionBadge session={session} />`, its own file under
  `app/src/features/webshooter/components/`) showing the official
  placement/medal + a Webshooter badge when `external_ref` is set. No
  other line in this file is touched, to minimize collision with the
  concurrent photo-scoring agent's edits to the same file.

## Auth model (PR #19 comment, 2026-09-01 — supersedes integration spec

§A.10's "the token is entered by the user" framing with the concrete
three-tier flow)

1. **Primary: in-app username/password login**, POSTed directly
   device→`webshooter.se` (never through any ShotLedger backend).
   Credentials are used once and never stored; only the resulting token is
   persisted (`expo-secure-store`). Implemented behind
   `shared/src/integrations/webshooter/api/spaLogin.ts`'s
   `WebshooterSpaLoginClient` interface — the core module's
   `createUnverifiedSpaLoginClient` stub always rejects with
   `WebshooterSpaLoginNotVerifiedError` (no network call), per its own
   VERIFY note (exact endpoint shape unconfirmed). The app wires this
   interface behind a UI form; **VERIFY (flagged, not resolved here):**
   the app ships the login form and calls the injected client, so once the
   maintainer confirms the real endpoint shape only `spaLogin.ts`'s
   implementation needs to change — the app layer is written against the
   interface, not the stub.
2. **Fallback: manual token paste** — always available, no VERIFY
   dependency, since the user can obtain a token from Webshooter directly.
3. Card number (identity) resolved via
   `shared/src/integrations/webshooter/identity.ts`'s `resolveIdentity`,
   stored in `settings` (not secret) alongside the SecureStore token.
4. Disconnect wipes both the SecureStore token and the stored card number
   override; it does not touch already-imported sessions.
