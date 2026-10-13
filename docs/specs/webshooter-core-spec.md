# Webshooter client core — executable spec

> old-coder SPEC for `shared/src/integrations/webshooter/`. Autonomous run:
> **spec approval: not obtained (autonomous run)** — this document is the
> artifact to review after the fact, per the skill's fallback. Scope, sources,
> and setup below authorize the implementation that follows.

## 0. Scope and sources

Implements the **pure-logic core** of `docs/specs/webshooter-integration-spec.md`
(v2, fetched from `origin/docs/webshooter-spec`) parts §A.7–§A.11, §B, §C.2, plus
the auth refinement from PR #19 comments (2026-09-01): in-app password login
device→`webshooter.se` directly (never through any ShotLedger backend),
token in `expo-secure-store` only, manual-token-paste fallback, WebView
interception rejected. No UI, no DB writes, no network calls — `fetch` is
always caller-injected. App wiring (`app/src/features/webshooter-import/`),
the Drizzle migration (schema §1 of the v2 spec), and `expo-calendar` wiring
are explicitly out of scope for this branch.

Domain facts: `docs/reference/spsf-shb-2026.md`, `.claude/skills/spsf-domain/`.
Reused, not duplicated: `shared/src/scoring/standardmedalj.ts` (fixed-threshold
medal path), `shared/src/scoring/marke.ts`/`totals.ts` (tenths conventions),
`shared/src/disciplines/` (discipline/program ids, weapon groups, classes).

**Real-data rule (hard constraint, not a style choice):** `~/.cache/webshooter/`
was read to learn payload shapes (competitions, results, signups, patrols —
field names, nesting, pagination envelopes, `classname` enumeration). No name,
card number, id, club, or value from that cache appears anywhere in this
repo. Every fixture below is invented. The enumeration in §4 (classname →
mapping) reproduces only the **shape of the strings** (`"C2"`, `"CD3"`, …)
observed across the cache, which is itself the wire format, not personal data.

## 1. Setup

- Isolation: git worktree at `.claude/worktrees/agent-ad59cb6d31107638e`,
  branch `feat/webshooter-core` off `origin/feat/m5-stats` (already has the
  full workspace built — no gitignored-content gap).
- No new dependencies. `zod` (already a `shared` dependency) for wire-schema
  validation; everything else is hand-rolled (no date/tz library — see §5.6
  for why `Intl` suffices without one).
- Files added, all under `shared/src/integrations/webshooter/` and
  `docs/specs/`:
  ```
  shared/src/integrations/webshooter/
    api/schemas.ts        api/schemas.test.ts
    api/httpClient.ts      api/httpClient.test.ts
    api/client.ts           api/client.test.ts
    api/spaLogin.ts
    api/index.ts
    api/fixtures.ts         -- synthetic wire-shape fixtures, shared by tests
    identity.ts             identity.test.ts
    mapping.ts               mapping.test.ts
    reconcile.ts              reconcile.test.ts
    stats/pb.ts                stats/pb.test.ts
    stats/yearOverYear.ts       stats/yearOverYear.test.ts
    stats/medals.ts               stats/medals.test.ts
    stats/index.ts
    calendar.ts               calendar.test.ts
    index.ts
  docs/specs/webshooter-core-spec.md      (this file)
  docs/specs/webshooter-core-evidence.md
  ```
- Infra edits needed to wire the gauntlet onto the new tree (minimal, additive,
  same pattern as the M3 layer — not "app UI or schema", the task's exclusion):
  `vitest.config.ts` test `include`/coverage `include` gain the new glob;
  `stryker.config.json` `mutate` gains the new glob; a new manual-mutation
  script `scripts/mutate-webshooter-schema.mjs` (mirrors
  `scripts/mutate-schema.mjs`) covers `api/schemas.ts`'s module-load zod
  declarations, which Stryker's vitest runner cannot activate
  (`ignoreStatic`, same reason as the M3 layer).
- Git: commit at SPEC, then at GREEN checkpoints per module, DCO-signed
  (`git commit -s`), Conventional Commits, explicit `git add <path>` only.

## 2. `api/` — typed client

### 2.1 Wire schemas (`api/schemas.ts`)

zod schemas for the fields this integration actually reads (not the full
Webshooter payload — extra upstream fields are ignored, not rejected: plain
`z.object`, never `z.strictObject`, on every wire schema, because the real
API returns dozens of fields we don't model and a strict schema would break
on the next unrelated field Webshooter adds).

- `weaponClassSchema`: `{ id, weapongroups_id, classname, championship,
classname_general }`.
- `stationResultSchema`: `{ id, signups_id, finals: 0|1, distinguish: 0|1,
stations_id, figure_hits, hits, points, station_figure_hits: number[],
deleted_at: string|null }`.
- `clubSchema` (minimal): `{ id, name }`.
- `userSchema` (minimal — identity + same-club, never a full profile):
  `{ fullname, shooting_card_number: string|null, clubs_id, clubs:
{ id, name }[] }`.
- `signupSchema`: `{ id, competitions_id, patrols_id, lane, weaponclasses_id,
start_time, end_time, weaponclass: weaponClassSchema.optional(), user:
userSchema.optional(), club: clubSchema.optional() }`.
- `resultRowSchema`: `{ id, competitions_id, signups_id, placement,
figure_hits, hits, points, weaponclasses_id, std_medal:
z.enum(['B','S']).nullable(), signup: signupSchema, weaponclass:
weaponClassSchema, results: stationResultSchema[], results_finals:
stationResultSchema[], results_distinguish: stationResultSchema[] }`.
- `resultsResponseSchema`: `{ results: resultRowSchema[] }` (matches the
  cache's `{"results": [...]}` envelope, confirmed against
  `competition_*_results.json` shapes).
- `competitionSchema`: `{ id, name, date, results_type:
z.enum(['precision','field','military','pointfield']).nullable(),
contact_city, contact_venue, status }` — confirmed field set/nesting
  against `competition_<id>.json` (singular `{"competitions": {...}}` wrap
  for the detail endpoint) and `competitions.json` (paginated
  `{"competitions": {"data": [...], "current_page", "last_page", "total",
...}}` for the list endpoint) — **two different envelope shapes for the
  same key name**, both modeled explicitly, not assumed identical.
- `patrolSchema`: `{ id, competitions_id, start_time, end_time, patrol_size,
signups: signupSchema[] }`.
- `patrolsResponseSchema`: `{ patrols: patrolSchema[] }`.
- `signupsResponseSchema`: `{ signups: { data: signupSchema[], current_page,
last_page } }` (paginated, confirmed against `competition_*_signups.json`).
- `authUserSchema`: `{ shooting_card_number: string|null, fullname:
string.optional() }` — **VERIFY**: `GET authenticate/user`'s exact response
  shape is not in the cache (it's a per-session call, never persisted); this
  schema assumes the same `user`-object field names embedded elsewhere in
  the API. Confirm against a live call before shipping.

Behaviors:

- Parsing a synthetic fixture built from each observed shape succeeds and
  strips nothing needed.
- Parsing a payload missing a required field throws a `ZodError`.
- Extra unknown top-level fields (as the real API sends) do not fail parsing.

### 2.2 HTTP client (`api/httpClient.ts`)

`createHttpClient(config): HttpClient` where `config = { fetchImpl: typeof
fetch, baseUrl, getToken: () => string | null, now?: () => number, sleep?:
(ms) => Promise<void>, retry?: { maxAttempts, baseDelayMs, factor } }`.

- `HttpClient.requestJson<T>(path, schema: ZodType<T>): Promise<T>` — GETs
  `${baseUrl}${path}` with `Authorization: Bearer <token>` when
  `getToken()` returns non-null (omitted header otherwise — anonymous
  endpoints don't exist in this integration's surface, but the client
  doesn't hard-fail before the request if a token is momentarily absent;
  the server will 401), parses the JSON body with `schema`.
- **Retry-on-5xx**: exponential backoff, `maxAttempts` total tries (default
  **3**, `VERIFY:` per spec §A.11 open question 1 — no published SLA),
  `baseDelayMs` default **500 ms** (`VERIFY:` same reason), `factor`
  default **2** (500ms, 1000ms, 2000ms between the 3 attempts). Retries
  ONLY on HTTP 500–599. A 4xx never retries (client error, retrying can't
  help and risks hammering an auth failure). Non-retryable errors and the
  final exhausted attempt reject with a `WebshooterHttpError` carrying
  `status` and `path`.
- `sleep`/`now` are injected (default `setTimeout`/`Date.now`) so tests run
  with a fake sleep and assert delay values without waiting in real time.
- Polite-client default: no built-in polling anywhere in this module — every
  method is a single on-demand fetch; caching/TTL policy lives in
  `api/client.ts` (§2.3), not here.

Behaviors:

- 200 response: schema-parses and returns, one fetch call.
- 500 then 200: two fetch calls, one sleep call at ~500ms, resolves with the
  200 body.
- 500 × `maxAttempts`: rejects with `WebshooterHttpError`, `maxAttempts`
  fetch calls, `maxAttempts - 1` sleep calls with the documented backoff
  sequence.
- 404: rejects immediately with `WebshooterHttpError{status:404}`, one fetch
  call, zero sleep calls.
- No token (`getToken` returns null): request sent with no `Authorization`
  header (asserted on the injected fetch mock's call args).
- Malformed JSON body: rejects (schema parse failure), not swallowed.

### 2.3 Typed endpoint client (`api/client.ts`)

`createWebshooterClient(httpClient, cacheConfig?): WebshooterClient` with:

- `listCompetitions(options?: { forceRefresh?: boolean }): Promise<Competition[]>`
  — `GET /competitions` (§A.11: no changed-since param, always full list).
  Cached with a TTL (default **15 minutes**, `VERIFY:` per spec §A.11 open
  question 1); `forceRefresh: true` bypasses the cache (the "explicit user
  refresh" the spec requires). Only page 1 of the paginated envelope is
  fetched — **`VERIFY:`** whether more than one page of competitions is ever
  realistic for one club's relevant window before shipping; not handled here.
- `getCompetition(id, options?): Promise<Competition>` — `GET
/competitions/{id}`, same TTL/cache/refresh contract, keyed by id.
- `getPatrols(competitionId, options?): Promise<Patrol[]>` — `GET
/competitions/{id}/patrols`, cached keyed by competition id, invalidated
  only on `forceRefresh` (§C.3: fetch only on explicit refresh).
- `getResults(competitionId, options?): Promise<ResultRow[]>` — `GET
/competitions/{id}/results`, same cache contract.
- `getSignups(competitionId, options?): Promise<Signup[]>` — `GET
/competitions/{id}/signups`, same cache contract, page 1 only (same
  VERIFY as listCompetitions).
- `authenticateUser(): Promise<AuthUser>` — `GET authenticate/user`, never
  cached (identity resolution is explicitly a fresh call per §A.10 order).

Cache: in-memory `Map<key, {data, expiresAt}>` owned by the client instance
(the caller — the app layer, later — decides persistence lifetime by how
long it keeps the client alive; this module never touches storage).

Behaviors:

- Two calls to `listCompetitions()` within the TTL: one underlying
  `httpClient.requestJson` call (injected mock counts).
- `forceRefresh: true`: bypasses a warm cache entry, refetches.
- Cache entry past TTL (fake clock advanced): refetches.
- `getResults`/`getPatrols`/`getSignups` cache independently per
  `competitionId` (two different ids ⇒ two fetches, same id twice ⇒ one).
- `authenticateUser()` called twice: two underlying fetches, always.

### 2.4 SPA login (`api/spaLogin.ts`) — interface only, VERIFY

Per PR #19: primary auth is in-app password login **directly against
webshooter.se**, never through a ShotLedger backend. This module declares
the shape the app layer will call against once the real endpoint is
inspected; it is **not implemented against a live endpoint** (no network
calls exist anywhere in this branch, per the task's hard constraint).

```ts
export interface WebshooterSpaLoginRequest {
  username: string;
  password: string;
}
export interface WebshooterSpaLoginResult {
  token: string;
}
export interface WebshooterSpaLoginClient {
  login(request: WebshooterSpaLoginRequest): Promise<WebshooterSpaLoginResult>;
}
```

`createUnverifiedSpaLoginClient(fetchImpl, baseUrl): WebshooterSpaLoginClient`
— throws `WebshooterSpaLoginNotVerifiedError` synchronously from `login()`
without ever calling `fetchImpl`. **`VERIFY:`** the exact login endpoint path,
request body field names, and response shape (inspect the SPA's own login
network request, per the maintainer's PR #19 comment) before replacing this
stub. Credentials/token must never transit a ShotLedger backend when it is
implemented — that constraint is documented here so the future
implementer can't miss it.

Behaviors: `login()` always rejects with the named error type; `fetchImpl` is
never invoked (mock call count 0).

## 3. `identity.ts`

- `normalizeCardNumber(raw: string | null | undefined): string | null` —
  strips all whitespace (space, tab, non-breaking space ` `) via
  `raw.replace(/\s/gu, '')`; `""`/`null`/`undefined`/`"None"` (Webshooter's
  own null-ish string, per spec §A.8) all normalize to `null`; anything else
  (including an alpha prefix like `"A1234"`) is returned trimmed of
  whitespace only, case preserved.
- `cardNumbersMatch(a, b): boolean` — normalizes both sides; `null` on
  either side (including both) is never a match, even
  `cardNumbersMatch(null, null) === false`.
- `resolveIdentity(input: { override?: string | null; stored?: string | null;
fetchAuthenticatedUser: () => Promise<{ shooting_card_number: string |
null }> }): Promise<string>` — resolution order (§A.10): (1) `override`
  if normalizes non-null, (2) `stored` if normalizes non-null, (3) calls
  `fetchAuthenticatedUser()` and normalizes its result. Throws
  `WebshooterIdentityUnresolvedError` if all three normalize to null.
  `fetchAuthenticatedUser` is only invoked when both (1) and (2) miss
  (asserted via mock call count) — the point of the order is never issuing
  the network call when a stored/override value exists.

Behaviors (table, exact per §A.8/§A.10):

| a           | b         | match                                                                                             |
| ----------- | --------- | ------------------------------------------------------------------------------------------------- |
| `"12 456"`  | `"12456"` | true                                                                                              |
| `"12456"`   | `"12456"` | true                                                                                              |
| `"A1234"`   | `"A1234"` | true                                                                                              |
| `"A1234"`   | `"a1234"` | false (case-sensitive — Webshooter card numbers are not documented case-insensitive; not guessed) |
| `null`      | `"12456"` | false                                                                                             |
| `null`      | `null`    | false                                                                                             |
| `"None"`    | `"12456"` | false                                                                                             |
| `"12\t456"` | `"12456"` | true (tab)                                                                                        |
| `"12 456"`  | `"12456"` | true (nbsp)                                                                                       |

## 4. `mapping.ts`

### 4.1 Classname → weapon_group/shooter_class

`mapClassname(classname: string): ClassnameMappingResult` where

```ts
type ClassnameMappingResult =
  | { ok: true; weaponGroup: string; shooterClass: string }
  | { ok: false; classname: string; reason: string };
```

Pattern table, checked in order, first match wins (data-driven regex list,
not a giant switch — new patterns are one array entry):

1. `^(A|B|C|R)(\d)$` → `weaponGroup: spsf:<letter>`, `shooterClass: <digit>`
   (the spec's own worked example: `'C2'` → `spsf:C`/`'2'`).
2. `^CD(\d)$` → `spsf:C` / `Dam<digit>` (matches `disciplines/classes.ts`'s
   `Dam1`/`Dam2`/`Dam3`).
3. `^CJun$` → `spsf:C` / `'Jun'`.
4. `^CVÄ$` → `spsf:C` / `'VetÄ'`.
5. `^CVY$` → `spsf:C` / `'VetY'`.
6. `^A Opt (\d)$` → `spsf:A-opt` / `<digit>` (spaced form observed in the
   cache, e.g. `"A Opt 1"`).
7. Anything else — **fail-soft, `ok: false`** with a reason string, never a
   guess. This deliberately includes, per the classname enumeration observed
   in the cache while researching shapes (§0): bare group letters with no
   class digit (`"A"`, `"B"`), `"AG"`/`"AP"`/`"AM"`/`"OptR"` (ambiguous
   sub-group codes with no class digit visible in the string), and `"M1"`–
   `"M9"` (magnum — not in `spsf-precision`'s or `spsf-milsnabb`'s
   `weaponGroups` list per `shared/src/disciplines/definitions/*.json`, so
   out of v1 scope even if resolvable). Per spec §A.8, an `ok: false` result
   is surfaced to the user for manual mapping and cached in `settings` by
   the **app layer** (not this module — this module is pure and has no
   settings access).
   `VERIFY:` the full enumeration against a live API response or Webshooter
   docs remains open per spec §A.8/open-question 3 — this table only
   encodes patterns with a confident, spec-consistent reading (the Dam/Jun/
   VetY/VetÄ suffix convention matches `disciplines/classes.ts` exactly);
   it does not claim completeness.

### 4.2 Competition type → discipline/program

`mapResultsType(resultsType: 'precision' | 'field' | 'military' |
'pointfield' | null): { disciplineId: string; programId: string } | null` —
`'precision'` → `spsf-precision`/`spsf-precision`, `'military'` →
`spsf-milsnabb`/`spsf-milsnabb` (§A.9/§0: the only two importable programs);
`'field'`, `'pointfield'`, `null` → `null` (§A.9: fält is listed, not
imported — the caller shows "Fält — stöds ej" and excludes it, this function
just reports "not importable").

### 4.3 Results → series-total-without-shots structures

Plain-data output types (DB writing is a later task, per the v2 spec's own
scoping):

```ts
export interface MappedSeriesOverride {
  position: number; // stations_id
  isFinal: boolean;
  note: 'särskjutning' | null; // distinguish rows only (§A.6)
  isTotalOverride: true;
  totalOverrideTenths: number;
  totalOverrideShotCount: number;
}
```

`mapStationResultsToSeries(row: ResultRow, shotsPerSeries: number):
MappedSeriesOverride[]` — flattens `results` (main round, `isFinal: false`,
`isShootOff: false`), `results_finals` (`isFinal: true`, `isShootOff: false`,
per §A.6 "same section semantics"), and `results_distinguish` (`isFinal:
false, isShootOff: true`, per §A.6 — an ordinary extra scored series; #727
replaced the `note: 'särskjutning'` with the flag) into one array, `totalOverrideTenths = row.points * 10`,
`totalOverrideShotCount = shotsPerSeries` (the program's fixed shot count,
per §A.4 — 5 for both v1 programs, passed in rather than hardcoded so the
function stays discipline-agnostic). `position` continues across all three
sections in their concatenation order (main, finals, distinguish) —
`VERIFY:` whether Webshooter's own `stations_id` numbering already
distinguishes finals/distinguish sections (it appears to restart at 1 per
section in the cache) or whether the importer must offset them for
`series.position` uniqueness within one session; this function offsets
(`position` is reassigned sequentially across the whole flattened output,
`stations_id` is not reused as `position`) so the DB-writing layer never has
to reconcile duplicate positions itself.

`mapOfficialResult(row: ResultRow): { officialPlacement: number;
officialStandardmedalj: 'none' | 'brons' | 'silver' }` — `std_medal: null` →
`'none'`, `'B'` → `'brons'`, `'S'` → `'silver'`. (`'guld'` never appears at
session granularity — märke i guld/standardmedalj i guld is an accumulated,
cross-session concept per `marke.ts`'s own comment — so this function's
return type has no guld case; the DB column's CHECK constraint still allows
it for a future accumulator, this mapper just never produces it.)

### 4.4 Local time → UTC

`localToUtcIso(localDateTime: string, timeZone = 'Europe/Stockholm'):
string` — Webshooter returns naive `"YYYY-MM-DD HH:mm:ss"` local timestamps,
no offset. Converts using the fixed-point `Intl.DateTimeFormat` technique
(no date/tz library dependency — see §5.6 for the one-paragraph algorithm
and why a single iteration always converges for this offset range): returns
an ISO 8601 UTC string (`...Z`).

Behaviors: a known summer date (CEST, UTC+2) and a known winter date (CET,
UTC+1) both convert correctly; the exact wall-clock instants either side of
both 2026 DST transitions (spring-forward gap, fall-back overlap) are
asserted against Sweden's actual 2026 transition dates so the fixed-point
algorithm is proven, not assumed, across the one case where a naive
implementation breaks.

## 5. `reconcile.ts`

### 5.1 External ref

`buildExternalRef(competitionId: number | string, signupId: number |
string): string` → `` `webshooter:${competitionId}:${signupId}` `` (§A.2:
the signup id is the "class-entry" discriminator — one signup per class
entry per competition, confirmed by the cache's `signups_id` being the join
key on every result row).

### 5.2 Exact match

`findExactMatch(existingSessions: readonly { id: string; externalRef:
string | null }[], externalRef: string): { id: string } | null` — first
session whose `externalRef === externalRef`; `null` when none (a fresh
import, never a "second session" per §A.2's own invariant — this function
is the short-circuit the caller uses to route to merge (§5.4) instead of
insert).

### 5.3 Heuristic match

`findHeuristicCandidates(existingSessions: readonly HeuristicSessionInput[],
candidate: { date: string; eventName: string; weaponGroup: string }, options?:
{ minNameSimilarity?: number }): HeuristicSessionInput[]` where
`HeuristicSessionInput = { id: string; externalRef: string | null; date:
string; eventName: string; weaponGroup: string }`. Filters to sessions with
`externalRef === null` (§A.2: heuristic only applies to pre-feature manual
sessions), same calendar day (`date` compared as `YYYY-MM-DD`, ignoring
time-of-day — both sides are assumed already in the same reference
timezone, per the v1 convention of storing UTC/displaying local: the caller
passes local calendar dates), same `weaponGroup` (exact), and event name
similarity ≥ `minNameSimilarity` (default **0.6** — a deliberately loose
default since this only ever surfaces a confirm/decline prompt, never
auto-merges, per §A.2's own "never silent" rule).

**Similarity approach** (`nameSimilarity(a, b): number`, `[0,1]`): normalize
(trim, lowercase, collapse internal whitespace) both strings, then
`1 - levenshteinDistance(a, b) / max(a.length, b.length, 1)`. Plain
Levenshtein (insert/delete/substitute cost 1) — chosen over token-set or
n-gram approaches because competition names are short (one line, no
sentence structure) and a typo/abbreviation ("KM Precision C" vs "KM
Precision C 2024") is exactly what edit distance catches; kept simple and
fully spec'd rather than importing a fuzzy-match library (no new dependency
justified for one small pure function).

### 5.4 Field-level merge

```ts
export const SCORE_BEARING_FIELDS = [
  'seriesOverrides',
  'officialPlacement',
  'officialStandardmedalj',
  'competitionName',
  'competitionDate',
] as const;
export const ENRICHMENT_FIELDS = [
  'firearmId',
  'ammoLotId',
  'notes',
  'seriesPhotoUri',
  'tags',
] as const;
```

`classifyMergeField(field: string): 'score' | 'enrichment' | 'unknown'` —
table lookup against the two arrays above (§A.3's own field lists).

`mergeSessionFields<T extends Record<string, unknown>>(existing: T,
incoming: Partial<T>): T` — for every key in `incoming`: if
`classifyMergeField(key) === 'score'`, always overwrite (even to a "smaller"
or `null`-ish value — Webshooter is authoritative, per §A.3); if `'enrichment'`,
overwrite ONLY when `existing[key]` is `null`, `undefined`, or `''` (never
clobber a user-entered value, per §A.3's exact wording); if `'unknown'`
(a field neither list names), the incoming value is **dropped** (never
written) and the key is reported in the function's second return value —
this is a fail-soft guard against a future caller passing a field this
module hasn't been told how to classify, rather than silently guessing
either behavior.

`mergeSessionFields` actually returns `{ merged: T; unknownFields:
string[] }` to make that guard observable/testable rather than a silent
behavior.

## 6. `stats/`

Grouping/PB validity, YoY, and dual-path medals per spec §B — ported wscli
semantics, `VERIFY:` flagged inline exactly where the spec itself flags them
(§B.1 milsnabb series count and "figure hits" tiebreak term, §B.2 two-point
slope). Input is plain "one row per competition result" data — this module
does not reach into `shared/src/scoring/stats.ts`'s shot-level types (no
per-shot data exists for imported results, §1/§B.4 of the v2 spec) except
where explicitly reusing `standardmedalj.ts` for the fixed-threshold medal
path (§B.3 — "no new threshold table").

### 6.1 Common input shape (`stats/types.ts` — folded into `stats/pb.ts` as

the primary export to avoid a file with no behavior of its own)

```ts
export interface CompetitionResultForStats {
  sessionId: string;
  competitionType: string; // disciplineId, e.g. 'spsf-precision'
  weaponGroup: string; // e.g. 'spsf:C'
  shooterClass: string; // e.g. '2' — full weaponClass = group+class
  date: string; // ISO date (competition date)
  beforeFinalTenths: number;
  beforeFinalSeriesCount: number;
  totalTenths: number; // == beforeFinalTenths when milsnabb (no final)
  totalSeriesCount: number;
  figureHits: number;
  innerTens: number;
}
```

### 6.2 Official PB (`stats/pb.ts`)

`isOfficialPbEligible(result): boolean` — precision: `competitionType ===
'spsf-precision' && beforeFinalSeriesCount === 7` (§B.1, exactly 7,
grundomgång only, finals excluded — score is `beforeFinalTenths`). milsnabb:
`competitionType === 'spsf-milsnabb' && totalSeriesCount === 12` (§B.1,
`VERIFY:` per spec — the 12-series cut is inferred from SHB's own format
matching standardmedalj's series count, not confirmed against wscli
directly — score is `totalTenths`, since milsnabb has no final section).

`officialPbScore(result): number` — `beforeFinalTenths` for precision,
`totalTenths` for milsnabb (the eligibility-gated score, §B.1).

`groupKey(result): string` — `` `${competitionType}:${weaponGroup}${shooterClass}` ``
(§B.1: full class string, weaponGroup+shooterClass concatenated, NOT either
alone).

`personalBests(results: readonly CompetitionResultForStats[]): Map<string,
{ allTime: CompetitionResultForStats | null; byYear: Map<number,
CompetitionResultForStats> }>` — filters to `isOfficialPbEligible`, groups
by `groupKey`, ranks descending by `officialPbScore`, ties broken by
`figureHits` desc (`VERIFY:` per spec §B.1 — "figure hits" term/definition
not confirmed against wscli source, this module treats the field named
`figure_hits` in the Webshooter payload as the tiebreak input at face
value), then `innerTens` desc. `allTime` is the single best row overall per
group; `byYear` is keyed by `new Date(result.date).getUTCFullYear()`.

### 6.3 Freeform local PB (`stats/pb.ts`, §B.5 — separate metric family)

```ts
export interface FreeformSessionForPb {
  sessionId: string;
  disciplineId: string;
  weaponGroup: string;
  shooterClass: string;
  date: string;
  seriesTenths: readonly number[]; // non-sighter, non-final, chronological
}
```

`bestNSeries(sessions, n): Map<string, { sessionId: string; totalTenths:
number } | null>` grouped by `` `${disciplineId}:${weaponGroup}${shooterClass}` ``
— for each session with `seriesTenths.length >= n`, sums the `n` highest
values in that session (§B.5: "best N-series", not necessarily consecutive
— a freeform session has no fixed series order to be consecutive within);
keeps the best such sum per group across all qualifying sessions. Sessions
with fewer than `n` series are skipped for that `n`, not zero-padded.

`bestSession(sessions): Map<string, { sessionId: string; totalTenths:
number }>` — per group, the session with the highest sum of ALL its
`seriesTenths`, any series count (§B.5: "best total regardless of series
count").

Both are labeled distinctly by the caller (§B.5's UI requirement — this
module just returns two differently-named functions/maps, never merges
their outputs into the official-PB map of §6.2).

### 6.4 Year-to-year (`stats/yearOverYear.ts`)

`yearOverYearGroupKey(result): string` — `` `${competitionType}:${weaponGroup}` ``
(§B.2: coarse — weapon GROUP only, e.g. `'C'`, not the PB grouping's full
class string — deliberately a different key function from §6.2's, so a
caller can never accidentally reuse one for the other).

`yearStats(results: readonly CompetitionResultForStats[]): Map<string,
Map<number, YearStat>>` where

```ts
export interface YearStat {
  year: number;
  count: number;
  meanTenths: number;
  medianTenths: number;
  sampleStdevTenths: number | null; // null when count < 2, same convention as shared/src/scoring/stats.ts
  minTenths: number;
  maxTenths: number;
  meanInnerTens: number;
}
```

computed over `totalTenths` per result (a competition-result total, not a
per-shot value — there is no shot-level data for imported results, §B.4),
grouped by `yearOverYearGroupKey` then by `new Date(date).getUTCFullYear()`.
Sample stdev uses the n-1 denominator (matches
`shared/src/scoring/stats.ts`'s `sampleStandardDeviationTenths` convention,
reimplemented locally rather than imported because that function takes
shot-level `StatsShot[]`, not result totals — same formula, different input
shape, documented as such rather than silently duplicated without
attribution).

`yearOverYearChange(current: YearStat, previous: YearStat | null):
{ absoluteTenths: number; percentage: number } | null` — `null` when
`previous` is `null` (§B.2: skip years with zero sessions, never treat as a
0-value data point — the caller is responsible for passing the nearest
PRECEDING year that has data, not literally `year - 1`;
`yearsWithData(group): number[]` is exported as a helper that returns the
sorted list of years actually present in a group, so the caller can find
"immediately preceding year with data" without reimplementing that skip
logic itself).

`twoPointTrend(years: readonly YearStat[]): { slopePerYear: number } | null`
— `null` when fewer than 2 distinct years; else `(last.meanTenths -
first.meanTenths) / (last.year - first.year)` where first/last are the
chronologically first and last entries of the (caller-sorted) input (§B.2,
`VERIFY:` explicitly flagged in the spec itself as unusual and worth
confirming it isn't actually a regression — implemented exactly as
literally described, not "corrected" to a least-squares fit).

### 6.5 Dual-path medals (`stats/medals.ts`)

`fixedThresholdMedal(result): StandardmedaljResult` — thin wrapper calling
`standardmedaljForSession` from `shared/src/scoring/standardmedalj.ts`
(§B.3: "no new threshold table") with `hasFinal` derived from
`totalSeriesCount !== beforeFinalSeriesCount`.

```ts
export interface RelativePlacementInput {
  placement: number;
  fieldSize: number;
  tiedAtCutoffCount?: number;
}
```

`relativePlacementMedal(input): 'silver' | 'brons' | null` — silver cutoff
`Math.floor(fieldSize / 9)`, brons cutoff `Math.floor(fieldSize / 3)` (§B.3,
SHB C.5.1.2 — best 1/9 / best 1/3, rounded down). `tiedAtCutoffCount`
(default `0`) extends the cutoff by that many places when >0 — the "ties
included at the cutoff" rule (§B.3) requires the caller to know how many
competitors are tied AT the cutoff placement, which this module cannot
derive from a placement/fieldSize pair alone; documented as a caller
responsibility, not silently ignored.

`MEDAL_RANK: Record<'guld'|'silver'|'brons'|'none', number>` (guld=3,
silver=2, brons=1, none=0) and `betterMedal(a, b)` — used by
`dualPathMedal(fixedResult: StandardmedaljValor | null, relativeResult:
'silver'|'brons'|null): { valor: 'brons'|'silver'|null; source: 'fixed' |
'relative' | 'tie' }` — picks the higher-ranked non-null result (§B.3: "the
better of the two medal levels wins"); `'tie'` when both are non-null and
equal-ranked (source transparency the spec's UI requirement needs — "Store
which path produced the result").

## 7. `calendar.ts`

`buildCalendarEvent(input: CalendarEventInput): CalendarEvent` per §C.2,
pure data only (no `expo-calendar` call — that's app-layer wiring, later):

```ts
export interface CalendarEventInput {
  competitionId: number | string;
  signupId: number | string;
  competitionName: string;
  city: string;
  weaponGroup: string;
  patrolNumber: number;
  lane: number;
  startLocal: string;
  endLocal: string; // 'YYYY-MM-DD HH:mm:ss', Stockholm-naive (same as the API)
}
export interface CalendarEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  startUtc: string;
  endUtc: string; // ISO, per §4.4 localToUtcIso
}
```

`uid`: `` `webshooter_${competitionId}-${signupId}` `` (§C.2: reused verbatim
from wscli's own scheme). `summary`: `competitionName`. `location`: `city`.
`description`: a fixed multi-line block — competition name, date (derived
from `startLocal`'s date part, Stockholm-local, not reconverted through UTC
so it never shifts to the previous/next calendar day across a DST/midnight
edge), venue is intentionally omitted from the input (`VERIFY:` the v2
spec's §C.2 bullet lists "venue" in the description but `contact_venue` vs
`contact_city` — used here as "city" for `location` — are two different
competition fields in the cache; this function accepts only `city` per the
spec's `location` bullet and folds a second free-text `venue` line into the
description ONLY when the caller supplies one via an optional `venue`
field, defaulting to omitted — documented gap, not a silent drop), vapengrupp,
patrol number, lane, and the fixed link
`` `https://webshooter.se/app/competitions/${competitionId}/information` ``.
`startUtc`/`endUtc`: `localToUtcIso(startLocal)`/`localToUtcIso(endLocal)`.

Behaviors: fixture patrol → asserts every field of the event object
verbatim, including the Stockholm-localized UTC conversion across both a
summer and (separately, per §4.4) a winter fixture.

## 8. Gauntlet plan

- Full suite: `vitest run` (root `pnpm check` also runs this).
- Types: `pnpm typecheck` (`tsc -b`, `shared` is in the build graph).
- Lint: `pnpm lint`.
- Coverage: `pnpm coverage` — 100% lines/functions/branches/statements on
  `shared/src/integrations/webshooter/**/*.ts` (vitest.config.ts extended,
  §1 setup).
- Mutation: `pnpm mutation` (Stryker, config extended, §1) for everything
  except `api/schemas.ts`'s static zod declarations, which
  `scripts/mutate-webshooter-schema.mjs` covers manually (same pattern and
  same fail-closed/restore guarantees as `scripts/mutate-schema.mjs`).
- Fixture round-trips: every synthetic fixture in `api/fixtures.ts` parses
  against its zod schema in a dedicated test (this is also the negative
  control for the schemas: one deliberately-broken fixture per schema
  proves the schema actually rejects bad shape, not just accepts good
  shape).
- No property-based tests: nothing here has an unbounded numeric domain
  worth fuzzing beyond the table-driven cases already listed (mapping and
  identity are finite pattern tables; stats are arithmetic already covered
  by the boundary cases in §6). Recorded as a scoped skip, not silently
  omitted.
- Real execution: N/A — no CLI/app entry point in this branch; "real
  execution" for a pure-logic library is the test suite itself actually
  importing and calling every exported function, which coverage already
  proves.
- Supply chain: no new dependency (§1) — nothing to audit.

## 9. VERIFY items carried into code (all also listed in the caller-facing

report, not just here)

1. `api/schemas.ts` `authUserSchema` — exact `authenticate/user` response
   shape, not in the cache.
2. `api/httpClient.ts` retry backoff (3 attempts, 500ms base, ×2 factor) and
   `api/client.ts` cache TTL (15 min) — no published Webshooter SLA.
3. `api/client.ts` — pagination beyond page 1 for `/competitions` and
   `/signups`, not handled.
4. `mapping.ts` classname enumeration — pattern table is confident for the
   patterns it covers, not claimed complete.
5. `mapping.ts` `mapStationResultsToSeries` — whether `stations_id`
   restarts per section (assumed yes, offset applied).
6. `stats/pb.ts` milsnabb 12-series PB cut, and the "figure hits" tiebreak
   term/definition — both inherited unresolved from the v2 spec itself.
7. `stats/yearOverYear.ts` two-point-slope trend — inherited unresolved from
   the v2 spec itself (flagged there as possibly a mis-described
   regression).
8. `calendar.ts` — venue text folded into description only when the caller
   supplies it; the v2 spec's own field list vs. the cache's actual
   `contact_venue`/`contact_city` split was reconciled by treating spec
   "venue" ⇒ `location`/`city` per the spec's own `location` bullet,
   documented above as an interpretation, not a fact.
