# Webshooter Integration Spec (v2)

> Execution spec for implementing agents, in the style of
> [`docs/implementation-plan.md`](../implementation-plan.md): says _exactly
> how_, not just what and why. If a task here is ambiguous or contradicts
> `docs/reference/spsf-shb-2026.md`, `docs/implementation-plan.md`, or an
> accepted ADR, **STOP and ask** — do not improvise product decisions. Rules
> 0.1–0.6 of `docs/implementation-plan.md` (branch-per-task, DCO-signed
> Conventional Commits, `pnpm check` green, no undeclared dependencies, no
> schema change without a Drizzle migration, `VERIFY:` items confirmed
> before shipping) apply unchanged to every task below.

**Status.** Webshooter import is listed as deferred to v2 in
`docs/implementation-plan.md` §9. This document is that v2 spec. It does
not change any v1 (M0–M7) task; it defines new milestones (`M8`–`M10`,
numbered to follow the v1 sequence) to be scheduled after v1 ships.

**Sources read before writing this spec:** `CLAUDE.md`,
`docs/implementation-plan.md` (§0 rules, §3 schema, §6.2–6.5c domain
data, §9), `docs/reference/spsf-shb-2026.md`. Part B additionally ports
semantics from an external survey of the `wscli` reference client —
cited inline as **"wscli local_query/stats/calculator semantics"**; where
this spec states a number or formula sourced from wscli rather than from
SHB directly, treat it as `VERIFY:` against wscli's actual source before
shipping, same as any other unconfirmed fact.

## Verified against the live service

**2026-09-20 — both authentication paths work against `webshooter.se`
(API v4.1.9), on the maintainer's own account.** Recorded here so the
question stops being re-raised (#352, and #65 before it).

| Path                                         | Result                                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Username + password, in the app              | Connects. Passed competitions and upcoming starts (signups) both returned. Maintainer's own report, 2026-09-20.                                                   |
| Manual API token, pasted into the app        | Connects, and the app resolves the identity live from the token — the connect screen reads "Ansluten — kortnummer &lt;n&gt;". Driven on the emulator, 2026-09-20. |
| `GET /authenticate/user` with a bearer token | `200`, account returned. Without the header: `500`.                                                                                                               |
| `GET /competitions` with a bearer token      | `200`, competitions returned.                                                                                                                                     |

The **token path is kept**, not because password login is unreliable, but
because password login is not a documented API: `spaLogin.ts` reads
webshooter.se's own client secret out of their AngularJS client at login
time (reverse-engineered 2026-09-11). If that front end changes, the token
is the only way in. Maintainer's decision, 2026-09-20.

The token lives in SecureStore and is never a DB row and never synced —
see §1 and `app/src/platform/secure-store.ts`. What the app stores is
unchanged by this verification.

**Still not supported:** fält (`webshooter.fieldNotSupported`). That is a
scoring-model limitation, unrelated to authentication.

## 0. Scope

Webshooter (`webshooter.se`, API v4.1.9) is SPSF's competition-management
platform: competition listings, patrol/start-list assignment, and
official results. This integration lets a shooter **import their own
official results into ShotLedger** and **see their upcoming starts**. It
is not a sync engine and not a general Webshooter client.

In scope:

- **Precision** and **militär snabbmatch** only — the two SPSF programs
  ShotLedger v1 supports (`docs/implementation-plan.md` §6.3). These map
  to the existing `spsf-precision` and `spsf-milsnabb` program ids.
- Selective, reviewed import of the user's own competition results.
- Local computation of personal bests (PBs) and year-to-year statistics
  once imported data exists.
- "My starts": upcoming signups shown in-app and exportable to the
  device calendar.

Out of scope (§D): fält results (listed, not importable), per-station
deviation analytics, wscli's sync/watermark machinery, the `mcp` command.

New code locations, following the conventions in
`docs/implementation-plan.md` §1:

- `shared/integrations/webshooter/` — pure TS, vitest-tested: API client,
  response types, reconciliation/matching logic, class-code mapping,
  merge logic. No RN imports, matching the `shared/` rule.
- `app/src/features/webshooter-import/` — import browse/pick UI, merge
  review UI, "My starts" screen and calendar export, one folder per
  feature per the existing convention.

## 1. Schema additions (Drizzle migration — do not hand-edit SQL)

Additive only; no v1 column is renamed or removed. Same conventions as
`docs/implementation-plan.md` §3: soft-delete, `updated_at` on every
write.

```
sessions        + external_source TEXT NULL             -- 'webshooter'; NULL = locally created
                + external_ref TEXT NULL                 -- see §A.2 exact-match key; UNIQUE
                                                          -- WHERE external_ref IS NOT NULL
                + external_synced_at TEXT NULL            -- last successful re-import merge
                + webshooter_competition_id TEXT NULL     -- for re-fetch on refresh
                + official_placement INTEGER NULL         -- authoritative, from Webshooter
                + official_standardmedalj TEXT NULL       -- CHECK(IN ('none','brons','silver','guld'))
                                                          -- authoritative, from Webshooter;
                                                          -- app's own computed indicator (§6.5b)
                                                          -- stays a separate, always-computed value

series          + is_total_override INTEGER NOT NULL DEFAULT 0  -- true when this series carries
                                                          -- a Webshooter series/station TOTAL with
                                                          -- no per-shot detail (see §A.4)
                + total_override_tenths INTEGER NULL      -- populated only when is_total_override=1;
                                                          -- same units as shots.value_tenths sum
                + total_override_shot_count INTEGER NULL  -- shot count backing the override total;
                                                          -- required so round counters (§4 M4) and
                                                          -- per-series averages (§6.5 stats) stay
                                                          -- correct without shot rows
                + note TEXT NULL                          -- e.g. "särskjutning" (§A.6)
```

`series` rows with `is_total_override=1` have **no child `shots` rows**.
Every query that sums `shots` to derive a series total (§3 "Derived
values… computed, never stored") must branch: if
`is_total_override=1`, use `total_override_tenths` and
`total_override_shot_count` instead of summing `shots`. Per-shot
statistics (§6.5 shot-value distribution, X%) **exclude** override
series entirely (no shot-level data exists); per-series statistics
(series mean, SD, best/worst series) **include** them, using the stored
total.

No new table for import candidates: duplicate/fuzzy matching (§A.2) is
computed live at import time against existing `sessions`/`series`, not
persisted.

**The Webshooter access token is never a DB row.** It is entered by the
user and stored in `expo-secure-store` (device keychain), keyed
per-device. It is explicitly excluded from any future cloud-sync payload
(ADR 0001 local-first sync) — this is a hard rule, not a default to
revisit: the `settings` table (`key`/`value` JSON) is a sync boundary
candidate, the token store is not.

## A. Selective import with reconciliation

### A.1 Browse/pick UI

- [ ] Import screen lists the user's Webshooter competitions (fetched via
      `GET /competitions`, client-filtered — see §A.11) with date, name,
      venue, and an already-imported / not-yet-imported badge.
- [ ] User selects one or more competitions to import; **no bulk
      "import everything" action exists**. Selecting a competition opens
      a per-competition review (signups → results → proposed series
      breakdown) before any write happens.
- **Done when:** a Maestro flow selects one competition, reviews it, and
  confirms import; no write occurs before the confirm step.

### A.2 Duplicate matching

Two tiers, never silent:

1. **Exact match** via `sessions.external_ref`, format:
   `webshooter:<competition_id>:<signup_or_class_discriminator>` — stable
   and unique per (competition, class-entry). A session with this ref
   already present ⇒ treated as already-imported, offered as a
   **re-import / merge** (§A.3), never a fresh duplicate.
2. **Heuristic match**, for sessions the user logged manually before this
   feature existed (no `external_ref`): same calendar day **and** same
   event/competition name **and** same weapon category (`weapon_group`)
   ⇒ candidate. Heuristic matches are **fuzzy candidates surfaced for
   user confirmation** in the review UI ("This looks like your existing
   session '<name>' from <date> — link them?") — never auto-merged and
   never silently imported as a second session.

- [ ] Confirmed link on a heuristic match backfills `external_ref` and
      `external_source` on the existing local session, then runs the
      field-level merge in §A.3 rather than creating a new row.
- [ ] Declined match imports as a new session with a fresh
      `external_ref`.
- **Done when:** unit tests cover exact-match short-circuit, heuristic
  candidate generation (day+event+weapon_group), and both accept/decline
  paths, with no path producing two sessions for one exact-ref match.

### A.3 Editable imports + field-level merge on re-import

- [ ] Imported sessions are **fully editable** like any local session —
      firearm, ammo lot, notes, photos (fields Webshooter has no concept
      of) are set locally after import.
- [ ] Re-importing a session already linked via `external_ref` (upstream
      correction, e.g. a results amendment) performs a **field-level
      merge**: - Score-bearing fields (series totals/overrides, shot data where
      present, `official_placement`, `official_standardmedalj`,
      competition metadata) are **overwritten from Webshooter**. - Enrichment fields (`firearm_id`, `ammo_lot_id`, `notes`,
      series `photo_uri`, tags) are **never clobbered** — re-import
      only ever adds/updates score fields, and only touches enrichment
      fields when they are currently NULL/empty (never overwrites a
      user-entered value). - `external_synced_at` is updated on every successful merge.
- **Done when:** a vitest fixture re-imports a session with locally-added
  firearm/notes/photo and an upstream score correction; assert score
  changed, enrichment fields unchanged.

### A.4 Granularity mismatch — series-level totals

Webshooter's `/results` exposes **per-series (station) totals only**, no
per-shot data. Imported series are created with `is_total_override=1`,
`total_override_tenths` = the Webshooter series total, and
`total_override_shot_count` = the program's `shotsPerSeries` (5 for both
`spsf-precision` and `spsf-milsnabb`; see schema note in §1 for why the
shot count is stored explicitly). No `shots` rows are created for these
series. See §1 for the read-path implications (per-shot stats exclude,
per-series stats include).

### A.5 Official results as authoritative data

- [ ] `sessions.official_placement` and `sessions.official_standardmedalj`
      are populated verbatim from Webshooter's results payload and
      displayed alongside — never merged into or replacing — the app's
      own computed standardmedalj indicator (`shared/scoring/standardmedalj.ts`,
      §6.5b of the implementation plan, computed for every session
      regardless of import source). Label both clearly in the UI (e.g.
      "Officiellt" vs. "Beräknat") since they can legitimately disagree
      (Webshooter may apply age adjustments, féreningstävling caps, or
      placement-based medals the app's fixed-threshold calculator
      doesn't model).

### A.6 Finals and särskjutning mapping

- [ ] Webshooter's `results_finals` block maps to series with
      `is_final=1`, same section semantics as
      `docs/implementation-plan.md` §6.3 (Before final / Final / Total,
      all derived the same way for imported and locally-entered
      sessions).
- [ ] Webshooter's `results_distinguish` (särskjutning) block maps to
      **ordinary extra scored series** (`is_final=0`, no special flag)
      with `series.note = 'särskjutning'`, matching the v1 decision in
      `docs/implementation-plan.md` §6.3 ("log such series as ordinary
      extra scored series with a note").

### A.7 Missing sighters

Webshooter's results feed does not report sighter (provskott) series at
all — only scored totals. Since sighters count toward volume metrics
(round counter, ammo-lot usage; §6.3) but never toward score, a silent
omission would under-count rounds fired on the linked firearm.

- [ ] The importer proposes, per round of the imported competition (one
      per round for championship two-round format, §6.3), an
      `extra_rounds` adjustment: **+5 rounds** (one 5-shot sighter series
      per SHB F.6.6.2 / J.6.6.2), surfaced as a confirmation toggle on
      each start in the review UI — default off, since the importer cannot
      know whether the shooter actually used their sighter allowance. A
      re-import does not offer it again.
- [ ] The firearm is chosen per start, independently of the toggle: a start
      is one weapon group and class, shot with one firearm, and starts in two
      weapon groups of one competition are usually two firearms (#725). It is
      assigned only to a session that has none (§A.3).
- [ ] Confirming applies the round-count/ammo-usage increment (same
      mechanism as §4 M4's per-shot increment) **without** creating a
      `series` row — there is no score, position, or override total to
      attach it to.
- **Done when:** unit test asserts round count is unaffected by default
  import and increases by exactly 5 × rounds-count when confirmed.

### A.8 Class mapping

- [ ] Webshooter `classname` strings map to the existing orthogonal
      `weapon_group` / `shooter_class` pair (`docs/implementation-plan.md`
      §6.4a): e.g. `'C2'` → `weapon_group: 'spsf:C'`,
      `shooter_class: '2'`. Mapping table lives in
      `shared/integrations/webshooter/classMapping.ts`.
  - `VERIFY:` the full enumeration of Webshooter classname strings
    (letter+digit forms, and how it encodes `1u`/`1b`/`1s`, `Jun`,
    `Dam1`–`3`, `VetY`, `VetÄ`) against a live API response or Webshooter
    docs before shipping — this spec assumes but does not confirm a
    `<vapengrupp-letter><klass-code>` pattern.
  - An unrecognized classname **prompts the user to map it manually**
    (dropdown of known `weapon_group`/`shooter_class` pairs) and is never
    guessed. Confirmed manual mappings are cached in `settings` (per
    `docs/implementation-plan.md` §3 `settings` key/value convention) so
    the user isn't asked twice for the same code.
- [ ] Shooting-card-number matching (used both for identity resolution,
      §A.10, and for filtering "own rows only", §A.10) strips all
      whitespace before comparison and tolerates `None`/missing values
      and odd formats — `"12 456"` and `"12456"` are equal;
      `"A1234"` keeps its alpha prefix; a `None` card number on either
      side never matches. Normalization lives in
      `shared/integrations/webshooter/cardNumber.ts`, unit-tested against
      these exact cases plus at least one additional whitespace variant
      (tabs, non-breaking space).

### A.9 Scope enforcement

- [x] `precision` and `military` import as `spsf-precision`/`spsf-milsnabb`
      series totals. `field` and `pointfield` import as `spsf-falt` stations
      (#352), in `falt`/`poangfalt` result mode; `mapStationResultsToFaltStations`
      in `shared/src/integrations/webshooter/mapping.ts` holds the rules. A row
      whose station data fails the fält input rules, or a competition with no
      `results_type`, is **listed in the review UI and marked not importable**
      — not hidden, so the user understands why a count does not match.

### A.10 Identity and auth

- [ ] Identity key is `shooting_card_number` (SPSF pistolskyttekort
      number), not a Webshooter internal user id. Resolution order,
      first match wins: 1. Explicit override in `settings` (user manually set a card
      number to import as). 2. Previously stored card number (from a prior successful
      `authenticate/user` call). 3. `GET authenticate/user` with the stored token, which returns the
      authenticated user's card number.
- [ ] The token is entered by the user (Webshooter issues personal API
      tokens; there is no OAuth flow in v4.1.9) and stored exclusively in
      `expo-secure-store` — see §1. It is **never** written to the
      `settings` table, never included in any export (CSV §6.8, PDF §M6),
      and never synced.
- [ ] Import only ever pulls rows attributable to the resolved
      `shooting_card_number` — other shooters' results in the same
      competition are personal data belonging to them and must not be
      fetched into this user's device beyond what a competition/patrol
      listing legitimately needs to render (e.g. "same-club patrol
      mates" in §C.1 is a name + patrol slot, not a full result row).

### A.11 API surface (v4.1.9, `webshooter.se`)

| Endpoint                         | Use                                                   | Notes                                                                                                           |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /competitions`              | list, browse (§A.1)                                   | **No changed-since parameter** — always returns the full list; filter client-side by date/discipline/relevance. |
| `GET /competitions/{id}`         | competition detail                                    |                                                                                                                 |
| `GET /competitions/{id}/patrols` | patrol/start-list, "My starts" (§C)                   |                                                                                                                 |
| `GET /competitions/{id}/results` | results incl. `results_finals`, `results_distinguish` | per-series totals only, §A.4                                                                                    |
| `GET /competitions/{id}/signups` | signup list, exact-match discriminator (§A.2)         |                                                                                                                 |
| `GET authenticate/user`          | resolve identity from token (§A.10)                   |                                                                                                                 |

- [ ] All requests use `Authorization: Bearer <token>`.
- [ ] Any `5xx` response retries with exponential backoff (base delay and
      max-retry count: `VERIFY:` with the maintainer — no published SLA
      to derive numbers from; see open questions).
- [ ] Be a polite client: since `/competitions` has no changed-since
      filter, cache the full listing with a TTL (`VERIFY:` TTL value) and
      only re-fetch on explicit user refresh; cache per-competition
      patrols/results/signups keyed by `competition_id` and invalidate
      only on explicit refresh or a confirmed re-import. Never poll in
      the background.

## B. Personal bests and year-to-year statistics

Source: **wscli `local_query`/`stats`/`calculator` semantics** (external
survey). Computed **locally**, in `shared/scoring/stats.ts` (extending
the v1 module from `docs/implementation-plan.md` §6.5), over ShotLedger's
own data — imported and manually-logged sessions alike, once any import
exists. This is a deliberate deviation from wscli, which proxies these
calculations against the live Webshooter API; ShotLedger never proxies —
§B.4.

### B.1 Personal-best grouping and validity

- [ ] PBs are grouped by `(competition_type, weapon_class)` where
      `weapon_class` is the **full** class string, e.g. `"C3"`
      (`weapon_group` + `shooter_class` concatenated, not either alone —
      a C2 and a C3 PB are tracked separately).
- [ ] **Precision PB validity**: exactly **7 series** — the SHB grundomgång
      length for championship format (`docs/reference/spsf-shb-2026.md`
      "Championship format", C.3.6.1.1). A session with fewer or more
      than 7 scored (non-sighter) series is not eligible as an official
      competition PB, regardless of source.
  - Score = **sum of series points from the 7-series grundomgång only**;
    finals are **excluded** (matches `docs/reference/spsf-shb-2026.md` —
    "Standardmedalj at championships is computed on the grundomgång…
    only"). This is the stored `beforeFinal` derived value
    (`docs/implementation-plan.md` §6.3) when the session has exactly 7
    non-final series.
- [ ] **Militär snabbmatch PB validity**: result points over **12
      series** (matches the standardmedalj series count for milsnabb,
      `docs/reference/spsf-shb-2026.md` §Standardmedalj — `VERIFY:` this
      count against wscli's actual milsnabb PB rule, since SHB's own
      milsnabb competition format is 3×4×5=12 scored series which happens
      to match, but confirm wscli doesn't apply a different cut such as
      excluding a round).
- [ ] Ranking within a group is **descending by score**; ties break by
      **figure hits** (VERIFY: exact wscli term/definition — likely X-ring
      or ring-count-based, not a fält concept, despite the name; confirm
      against wscli source), then by **inner tens** (X count).
- [ ] PB scope: maintain both an **all-time** PB and a **per-year** PB per
      `(competition_type, weapon_class)` group.

### B.2 Year-to-year statistics

- [ ] Grouped by `(competition_type, weapon_group)` — note **weapon
      group**, i.e. the first character/code only (e.g. `C`, not `C2`),
      coarser than the PB grouping in §B.1.
- [ ] Per year: count, mean, median, sample standard deviation, min, max,
      average inner-tens (X count) — computed the same way as v1's
      per-period stats (`docs/implementation-plan.md` §6.5, "sighter
      series excluded from every score metric").
- [ ] Year-over-year change: absolute and percentage, computed against
      the immediately preceding year with data (skip years with zero
      sessions, don't treat them as a 0-value data point).
- [ ] Overall trend: **two-point slope** — `(last year's mean − first
year's mean) / (last year − first year)` — not a regression over
      all years. `VERIFY:` this against wscli source; a two-point slope
      is unusual and worth double-checking it isn't actually a
      least-squares trend being described loosely.

### B.3 Medal counting — dual path, better wins

Per session (or per PB, per the maintainer's later UI decision — flag
this ambiguity, don't resolve it here):

- [ ] **Fixed-threshold path**: reuse `shared/scoring/standardmedalj.ts`
      (already implemented per `docs/implementation-plan.md` §6.5b) —
      no new threshold table.
- [ ] **Relative-placement path**: silver = best **ninth** (top 1/9 of
      the field, rounded **down**, per `docs/reference/spsf-shb-2026.md`
      Standardmedalj — "silver to best 1/9"), bronze = best **third**
      (top 1/3, rounded down), **ties included at the cutoff** (a shooter
      tied with the last qualifying place also qualifies). This path
      requires the full field's placement data, which the app only has
      for **imported** sessions with `official_placement` populated —
      it cannot be computed for locally-only sessions.
- [ ] For imported sessions with both paths available, **the better of
      the two medal levels wins** (guld > silver > brons > none). Store
      which path produced the result for UI transparency ("Standardmedalj
      silver (poänggräns)" vs. "…(placering)").

### B.4 Local computation, not a wscli proxy

- [ ] Once any import exists, PB and year-to-year computations run
      **entirely locally** over `sessions`/`series` (imported +
      manually-logged) — never a live proxy call to a wscli-equivalent
      endpoint. This is the point of porting the semantics rather than
      the tool.
- [ ] Imported-only metrics (§B.3 relative-placement path; any stat that
      would need per-shot detail) must handle series-without-shots
      correctly — reuse the branch described in §1: sum
      `total_override_tenths` where `is_total_override=1`, sum `shots`
      otherwise, never attempt to read `shots` for an override series.

### B.5 Deviation from wscli: local freeform PBs are a separate metric

wscli's 7-series-only precision PB rule (§B.1) is correct for **official
competition PBs** but would hide every freeform local session (v1 M3:
"series are added one at a time... never a fixed count") from personal
best tracking entirely — most of a typical user's training data. This
spec deliberately diverges:

- [ ] Maintain a **separate, additional** PB metric family for freeform
      sessions of any series count: "best N-series" (per commonly-shot
      lengths, e.g. best-5-series, best-10-series) and "best session"
      (best total regardless of series count), grouped the same way as
      §B.1 by `(competition_type, weapon_class)` where `competition_type`
      for freeform training sessions is the discipline/program id, not a
      SHB competition category.
- [ ] These are labeled distinctly from, and never merge into, the
      **"official competition PB (wscli-compatible)"** metric of §B.1 —
      the UI must make clear which PB a shown number is (e.g. a card
      titled "Personbästa (officiell, 7 serier)" separate from "Bästa
      session").

## C. Start times → calendar ("My starts")

### C.1 My starts screen

- [ ] Lists upcoming competitions where the resolved `shooting_card_number`
      (§A.10) has a signup (`GET /competitions/{id}/signups` filtered
      client-side, iterated per §C.3), each showing: patrol start time,
      patrol end time, patrol number, lane, venue/city, and same-club
      patrol mates (name + patrol slot only, from the patrol listing —
      not a full result fetch, per the personal-data boundary in §A.10).
- [ ] "Same-club" filtering: `VERIFY:` how club affiliation is exposed in
      the patrol payload (a club id/name field is assumed but not
      confirmed against a live response).

### C.2 Add-to-calendar via `expo-calendar`

- [ ] Per-start "Add to calendar" action creates a device calendar event: - **UID**: `webshooter_{competition_id}-{signup_id}` — stable and
      dedupable, reused verbatim from wscli's own scheme so a user who
      also uses wscli never gets a duplicate event. - **Summary**: competition name. - **Location**: city. - **Description**: competition name, date, venue, vapengrupp
      (weapon group), patrol number, lane, and a link to
      `https://webshooter.se/app/competitions/{competition_id}/information`. - **Times**: patrol start/end, localized to `Europe/Stockholm`
      (matches the v1 convention of storing UTC and displaying local,
      `docs/implementation-plan.md` §2 Dates row) regardless of device
      timezone.
- [ ] Re-tapping "Add to calendar" for an already-added start updates the
      existing event (matched by UID) rather than creating a duplicate.
- **Done when:** unit test constructs the event object (no OS calendar
  call) from a fixture patrol and asserts UID, summary, location,
  description, and Stockholm-localized start/end.

### C.3 No aggregate upstream endpoint

Webshooter has no "my upcoming starts across all competitions" endpoint.

- [ ] The client iterates future competitions (from the cached
      `/competitions` listing, §A.11) and fetches `/patrols` per
      competition, checking for the user's signup client-side.
- [ ] Cache aggressively (same TTL discipline as §A.11); fetch only on
      explicit user-triggered refresh of the "My starts" screen — never a
      background poll, consistent with the polite-client rule in §A.11.

## D. Out of scope for this integration

- **Field per-station deviation analytics** — would require fetching
  full competition results (all shooters, all stations) rather than the
  user's own rows, which conflicts with the personal-data boundary in
  §A.10. Revisit only if a server-side cache/proxy is built (i.e. never
  fetch this directly from the device). Not scheduled.
- **wscli's sync/watermark machinery** — ShotLedger uses its own local
  caching (§A.11, §C.3) and the `external_synced_at` field (§1); no
  watermark/cursor state is ported.
- **The `mcp` command** (wscli's MCP-server mode) — irrelevant to an app
  integration; not ported in any form.

## Open questions (maintainer to confirm)

1. Rate-limit courtesy numbers: retry backoff base delay/max attempts
   (§A.11) and cache TTLs (§A.11, §C.3) — no published Webshooter SLA to
   derive these from.
2. Whether Webshooter's ToS permits a third-party client at all — the
   maintainer needs to confirm this with the API owner (i.e., in his own
   club/federation context) before this milestone is scheduled, not just
   before it ships.
3. Full Webshooter `classname` enumeration (§A.8) — needs a live API
   sample or Webshooter's own docs, not assumed from the `'C2'` example
   alone.
4. Milsnabb PB series count and the "figure hits" tiebreak term (§B.1) —
   confirm both against wscli's actual source rather than this spec's
   best-guess mapping to SHB's standardmedalj series count.
5. Two-point-slope trend definition (§B.2) — confirm it isn't a
   loosely-described regression.
6. Where medal counting (§B.3) is displayed: per-session, per-PB, or
   both — not decided here.
7. Club-affiliation field on the patrol payload, for "same-club patrol
   mates" (§C.1) — needs a live response to confirm the field exists and
   its shape.
