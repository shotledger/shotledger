# M6 compliance engine — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md). Routine
UI/PDF work around it uses normal tests, not this gauntlet.

**Partly superseded (2026-09-16) by `compliance-fap551-spec.md`**, which
settles the FAP 551-3 numbers this document could only ship as VERIFY
placeholders, and adds the shooter-chosen 5 §/6 § profile variant. Where the
two differ on the `se` numbers, `JurisdictionProfile`'s shape, or the
"unverified defaults" hint, that spec wins. Everything else here — the
activity definition, the rolling window, the green/amber/red banding, the
Bilaga 8 indicators — still stands.

**Spec approval: not obtained (autonomous run, per implementation-plan.md
§0 rule and the M6 task brief).** This document is the artifact for the
maintainer to review after the fact, per the old-coder skill's autonomous-mode
provision.

**Isolation:** none — Tier 2 (normal feature, no money/auth/concurrency), on
branch `feat/m6-compliance` off `feat/score-x-semantics`, in the shared main
working tree per the task brief (not a fresh worktree).

**Setup plan:** no new runtime dependency for `shared/compliance` itself (pure
TS, reuses `shared/scoring/marke.ts` and `stats.ts` already in the tree). New
files only, under `shared/src/compliance/`. `vitest.config.ts`'s coverage
`include` and `stryker.config.json`'s `mutate` globs are extended to cover the
new directory (both existing gauntlet layers, not a new tool).

## Domain framing (§6.6, SHB Bilaga 8 p. 484)

Two authoritative sources, kept separate per the implementation plan:

- **FAP 551-3** numeric activity-frequency requirements: **not available** in
  any source in this repo _at the time of this spec_ — settled since, see
  `compliance-fap551-spec.md`; the paragraph below records the M6 state. `docs/reference/spsf-shb-2026.md` states SHB itself
  does not reference FAP 551-3's numeric counts. The maintainer reviews
  föreningsintyg professionally and will supply real numbers; until then the
  `se` profile ships **VERIFY placeholder** numbers only, clearly marked, and
  the license-activity UI must show an "unverified defaults" hint whenever they are
  in effect.
- **SHB Bilaga 8** club-intyg indicators (verified, p. 484): ≥6 months active
  membership before first intyg (first weapon .22); grovkaliber earliest after
  12 months; pistolskyttekort held; pistolskyttemärke i guld — or årtalsmärke
  within the last two years — fulfilled. Only the pieces computable from app
  data are implemented: months of logged activity, and guld-märke fulfillment
  via `shared/scoring/marke.ts` over a rolling 24-month window. Pistolskyttekort
  and grovkaliber-timing are not app-tracked data — out of scope, not faked.

## Data model

```ts
interface ActivityWeighting {
  training: number; // weight per training session; 0 excludes the type
  competition: number;
}

interface WeaponGroupComplianceRule {
  weaponGroups: string[]; // federation-scoped ids this rule applies to
  windowMonths: number;
  requiredActivities: number;
  countsAs: ActivityWeighting;
}

interface JurisdictionProfile {
  id: 'se';
  name: { sv: string; en: string };
  rules: WeaponGroupComplianceRule[];
  source: string; // citation string, shown in UI
  verified: boolean; // false => license-activity UI must show "unverified defaults"
}
```

`'none'` is not a `JurisdictionProfile` value — `getProfile('none')` returns
`null`, and the UI hides all compliance chrome when the resolved profile is
`null`. This is the §6.6 rule "UI hides with no profile."

**Activity definition (binding):** an activity = one session (matching a
rule's session-type weighting and weapon group), counted **once**, not once
per series. `extra_rounds` never create activities — they are not sessions.
Tombstoned sessions (`deleted_at` set) must already be filtered by the
caller (the DB query layer, as with every other `shared/` consumer) —
`shared/compliance` takes plain arrays and trusts them tombstone-free, exactly
like `shared/scoring/stats.ts` trusts its `StatsSeries[]` input.

**Rolling window:** `[now - windowMonths, now]`, inclusive of `now`,
exclusive of the lower bound computed via calendar-month subtraction (not a
fixed day count) — reuses the same "subtract N months" primitive across both
license activity and the SE constants, tested at a month-length boundary
(31-day vs 28-day month) so DST/day-count edge cases don't silently pass.

**Status thresholds (binding, since SHB gives no threshold banding — this is
an app-level UX choice, not a regulatory fact, so it is not itself a VERIFY
item):** given `count` = weighted activity count in the window and
`required` = `requiredActivities`:

- `green` when `count >= required`
- `amber` when `count >= ceil(required / 2)` and `count < required`
- `red` otherwise (includes `required <= 0`, which is always green instead —
  see behavior table)

## Behaviors — `license-activity.ts`

| #   | Scenario                                                                                                                                                                                                       | Expected                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| B1  | No sessions, any profile rule                                                                                                                                                                                  | `activityCount: 0`, `status: 'red'` (unless `requiredActivities <= 0`)                                                           |
| B2  | `requiredActivities <= 0`                                                                                                                                                                                      | `status: 'green'` always, regardless of count                                                                                    |
| B3  | Sessions inside window, type in `countsAs` with weight 1                                                                                                                                                       | each counts 1 toward `activityCount`                                                                                             |
| B4  | Session outside window (before `windowStart`)                                                                                                                                                                  | excluded                                                                                                                         |
| B5  | Session exactly at `now`                                                                                                                                                                                       | included (inclusive upper bound)                                                                                                 |
| B6  | Session exactly at `windowStart` boundary                                                                                                                                                                      | included (inclusive lower bound)                                                                                                 |
| B7  | Session one instant before `windowStart`                                                                                                                                                                       | excluded                                                                                                                         |
| B8  | Session type with weight 0 in `countsAs` (e.g. `{training: 1, competition: 0}`)                                                                                                                                | competition sessions don't count                                                                                                 |
| B9  | Two sessions same day, same weapon group                                                                                                                                                                       | both count (activity = session, not day)                                                                                         |
| B10 | `count === required`                                                                                                                                                                                           | `status: 'green'`                                                                                                                |
| B11 | `count === ceil(required/2)`, `< required`                                                                                                                                                                     | `status: 'amber'`                                                                                                                |
| B12 | `count === ceil(required/2) - 1`                                                                                                                                                                               | `status: 'red'`                                                                                                                  |
| B13 | `computeLicenseActivityForWeaponGroup` — session's `weaponGroup` not in the rule's `weaponGroups` list                                                                                                         | excluded from that rule's count                                                                                                  |
| B14 | `computeLicenseActivityForWeaponGroup` — no rule matches the requested weapon group                                                                                                                            | returns `null` (not a fabricated zero-required green)                                                                            |
| B15 | `computeFirearmLicenseActivity` — sessions matched by `session.weaponGroup` membership in the firearm's assigned weapon-group list (not by `session.firearm_id`), per §6.6 "per firearm via its weapon groups" | a session naming a weapon group the firearm holds counts, even if `firearm_id` differs or is null                                |
| B16 | `computeFirearmLicenseActivity` with a firearm holding two weapon groups covered by two different rules                                                                                                        | returns one status per rule; caller (UI) picks worst for a single chip, per §"Overall aggregation" below                         |
| B17 | `computeOverallLicenseActivity` — multiple weapon groups present, mixed statuses                                                                                                                               | overall = worst of (`red` &lt; `amber` &lt; `green`) across all rules that have ≥1 matching session or ≥1 requested weapon group |
| B18 | `computeOverallLicenseActivity` — no weapon groups requested/present at all                                                                                                                                    | returns `{ statuses: [], overall: null }` — never fabricates a status from nothing                                               |
| B19 | 31-day vs 28-day month subtraction at a `windowMonths` boundary (Jan 31 − 1 month)                                                                                                                             | uses calendar month subtraction (clamped to the shorter month, JS `Date` default behavior), documented not "exactly 30 days"     |

## Behaviors — `indicators.ts` (Bilaga 8)

| #   | Scenario                                                                                                                             | Expected                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| I1  | `monthsOfLoggedActivity` — no sessions                                                                                               | `{ months: 0, firstSessionIso: null }`                           |
| I2  | `monthsOfLoggedActivity` — one session 6 months + 3 days ago                                                                         | `months: 6` (whole months, floor)                                |
| I3  | `monthsOfLoggedActivity` — one session 5 months 29 days ago                                                                          | `months: 5`                                                      |
| I4  | `monthsOfLoggedActivity` — earliest of several sessions is used, later ones ignored                                                  | matches the earliest `startedAt`                                 |
| I5  | `pistolskyttemarkeGuldFulfillment` — one guldserie 10 months ago, vapengrupp C                                                       | `fulfilled: true`, `guldserieCountLast24Months: 1`               |
| I6  | `pistolskyttemarkeGuldFulfillment` — one guldserie 25 months ago (outside the 24-month window)                                       | `fulfilled: false`, count `0`                                    |
| I7  | `pistolskyttemarkeGuldFulfillment` — no series at all                                                                                | `fulfilled: false`, count `0`                                    |
| I8  | `pistolskyttemarkeGuldFulfillment` — series below guld threshold                                                                     | not counted                                                      |
| I9  | `pistolskyttemarkeGuldFulfillment` — respects `birthYear` age reduction (delegates to `marke.ts`, never re-implements the threshold) | a series that only clears the age-reduced threshold still counts |

**VERIFY on I5–I9's fulfillment rule:** "fulfilled" here means **≥1
guldserie in the trailing 24 months**. SHB Bilaga 1 does not state in the
material available to this repo how many guld-series (or which match format)
constitute earning the badge itself — this file's threshold table is
per-series only. The indicator is therefore a **placeholder proxy** flagged
VERIFY in the module doc-comment and surfaced as `ruleVerified: false` on the
result, not a confirmed pass/fail.

## Behaviors — `profiles/se.ts` and `getProfile`

| #   | Scenario                                                                                                                                      | Expected                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P1  | `getProfile('se')`                                                                                                                            | returns the SE profile, `verified: false`                                   |
| P2  | `getProfile('none')`                                                                                                                          | returns `null`                                                              |
| P3  | SE profile's rules cover every SPSF weapon group used in v1 disciplines (`A`, `AM`, `AP`, `AG`, `A-opt`, `B`, `C`, `R`) plus `generic:airgun` | every listed group id resolves to exactly one rule via `ruleForWeaponGroup` |
| P4  | SE profile numbers trace to `constants-se.ts`, not inlined                                                                                    | changing the constants file changes the profile (no duplicated literals)    |

## Negative constraints (must NOT happen)

- N1: `shared/compliance` never imports anything from `app/` (dependency
  direction, matches the rest of `shared/`).
- N2: no function silently treats an `extra_rounds`-only session (there is no
  such session type — `extra_rounds` lives on the session row, not a series;
  this constraint restates that no compliance function accepts or expects a
  "series" input for counting activities — session-level only).
- N3: existing `shared/scoring` and `shared/disciplines` test suites remain
  green and untouched (regression baseline).

## Gauntlet plan

- Full `pnpm coverage` run, `include` extended to
  `shared/src/compliance/**/*.ts`, threshold 100/100/100/100 (existing
  config, extended glob — same layer).
- `pnpm mutation` (`stryker.config.json`'s `mutate` glob extended to
  `shared/src/compliance/*.ts`), threshold unchanged (break 95).
- `pnpm typecheck && pnpm lint` (existing layers, whole repo).
- No property-based tests added — the domain is small enumerable calendar
  math and lookup tables, not parsing/serialization; boundary-value table
  tests (B4–B7, B10–B12, B19) cover the edges a property test would target.

## Out of scope for this spec

PDF export, license-activity UI, Settings profile picker, custom Stats period,
Maestro flow, i18n strings. Those are routine app-layer work per CLAUDE.md
and get ordinary tests, documented in the M6 evidence/report instead of this
spec.
