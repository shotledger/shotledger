# Per-firearm FAP 551-3 criteria — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md), the
query that feeds it, and the firearm-detail UI that shows the result. Issue
[#329](https://github.com/jimisola/shotledger/issues/329). Builds on
[`compliance-fap551-spec.md`](compliance-fap551-spec.md), which transcribed
these two criteria and deliberately did not model them; everything that spec
settles — the source, the numbers, the reading of "sammantaget i genomsnitt",
the 5 §/6 § variant mechanism — is unchanged and not restated here.

**Spec approval: not obtained (autonomous run).** Issue #329 is the
maintainer's own statement of what to build and is an _input_ to this spec,
not approval of it. This document is the artifact for review after the fact,
per the old-coder skill's autonomous-mode provision.

**Tier 2** (normal feature). No money, auth, concurrency or data loss. The one
real risk is misstating a regulation, which no gauntlet layer catches; it is
addressed the same way as last time — the source is quoted verbatim, every
number cites it, and nothing the source does not state is modeled.

**Setup plan:** no new dependencies, no new tooling, no schema change. Files
touched by path:

- `shared/src/compliance/types.ts` — `ComplianceSession.firearmId`,
  `FirearmComplianceRule`, `FirearmFact`, `FirearmCriterionActivity`
- `shared/src/compliance/firearm-criteria.ts` (new) + its test
- `shared/src/compliance/status.ts` (new) — the banding lifted out of
  `license-activity.ts` so both paths share one copy
- `shared/src/compliance/constants-se.ts`, `profiles/se.ts`,
  `profile-registry.ts`, `index.ts`
- `app/src/db/queries/compliance.ts` — select `firearm_id`
- `app/src/features/firearms/use-firearm-detail.ts`
- `app/src/app/firearms/[id]/index.tsx`, `app/src/i18n/{en,sv}.json`
- `docs/manual/explanation/license-activity{,.sv}.md`,
  `docs/manual/guides/license-activity{,.sv}.md`

## The source

Unchanged: Polismyndigheten's form **PM 551.24 "Föreningsintyg"**, page 3.
The two statements under **Intyget avser**, verbatim (quoted in full in
`compliance-fap551-spec.md`, items 3 and 4):

3. **Ytterligare enhandsvapen** — "ange med kryss i rutan om sökanden har
   tränat eller tävlat minst två gånger under de senaste sex månaderna med
   respektive tidigare innehavda enhandsvapen."
4. **Förnyelse av tidsbegränsat tillstånd** — "ange med kryss i rutan om
   sökanden har tränat eller tävlat med sökt vapen minst fyra gånger per år
   under de senaste två åren."

Both are **per firearm**, which is why they were not modelable when the
earlier spec was written. Three things have since changed: `sessions.firearm_id`
exists, `firearms.is_own` landed in #300, and #328 made the export carry
firearms and licenses so imported data has them too.

## What each criterion needs, and the proxy the app uses

Neither criterion can be evaluated from a licence register the app does not
have. Each therefore runs on a **stated proxy**, and a proxy that is not
stated is a lie — so each is named on screen and in the manual.

| Criterion                | The form asks about                          | The app's proxy                                                      |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------- |
| Ytterligare enhandsvapen | "respektive tidigare innehavda enhandsvapen" | a firearm whose weapon type is `pistol` or `revolver` and `is_own`   |
| Förnyelse                | "sökt vapen", on a time-limited permit       | a firearm whose most recent licence row has a non-null `valid_until` |

The second proxy is the one #329 expected to be blocked on a schema change,
and it is not: `licenses.valid_until` already carries exactly this fact —
"giltighetstid t.o.m.; NULL = tills vidare". A licence with an end date **is**
a tidsbegränsat tillstånd. Nothing new is stored.

`SE_HANDGUN_WEAPON_TYPES` is reused for the first proxy rather than
re-listed — it is the same "what counts as an enhandsvapen" judgement the
5 §/6 § derivation already makes, `airgun` excluded for the reason given in
`compliance-fap551-spec.md`.

## Two twelve-month windows, not one of twenty-four

"Fyra gånger per år under de senaste två åren" is **≥4 in each of the last two
twelve-month periods**, not ≥8 across twenty-four months. A shooter who fired
eight times last month and none the year before does not satisfy it, and a
single-window model would say they did.

So a firearm rule carries a `windowCount`. The windows are consecutive and
tile backwards from `now`: window 1 is `[now − 12 months, now]`, window 2 is
`[now − 24 months, now − 12 months)` — half-open at the end, so an instant on
the boundary is counted once, by the newer window — using the same `subtractMonthsUtc`
calendar arithmetic the six-month window already uses. The criterion is met
only when **every** window reaches `requiredActivities`.

`windowCount: 1` is the ordinary case and is what "ytterligare enhandsvapen"
uses, so the two criteria are one shape.

Deliberately **not** applied to 5 §/6 §: those say "sammantaget i genomsnitt …
under de senaste sex månaderna", one window, and that reading is settled.

## Why these are not `ComplianceRule`s

#329 sketches a third `scope: 'firearm'` in the existing discriminated union.
This spec deviates, and says why: the two are different objects.

A `ComplianceRule` is **the** activity requirement — exactly one variant's
rules apply, the shooter picks which in Settings, and the result is a
`LicenseActivity` with a green/amber/red banding. These two are **extra
checkboxes on one form**, they apply per firearm regardless of which paragraph
the shooter falls under, they have a `windowCount` and a per-window result
that `LicenseActivity` has no field for, and each needs a condition saying
which firearms it covers at all.

Folding them in would have put four optional fields on `LicenseActivity` that
are meaningless for the shooter-scope rule, and a fourth branch in
`ruleCountsSession` that the 5 §/6 § path would carry forever. Instead:

```ts
export interface FirearmComplianceRule {
  criterionId: string; // opaque to shared/; the app maps it to an i18n label
  windowMonths: number;
  windowCount: number;
  requiredActivities: number;
  countsAs: ActivityWeighting;
  /** Which firearms this criterion covers at all. */
  appliesTo: (firearm: FirearmFact) => boolean;
}
```

They hang off `JurisdictionProfileDefinition.firearmCriteria` — on the
definition, not on a variant, because they are not one of the two cases.
`license-activity.ts`, `months.ts` and `indicators.ts` are **not modified**.

`appliesTo` is a predicate rather than a declarative condition id so that what
counts as a held handgun stays in `profiles/se.ts` with the rest of Sweden,
and `shared/src/compliance`'s engine keeps knowing nothing about any
jurisdiction.

## Met, and separately a status

The form's two criteria are **checkboxes**: a club ticks them or does not.
`met` is therefore the primary result, per window and overall.

A green/amber/red `status` is reported alongside, from the same
`statusFor` banding the rest of the compliance UI uses, computed on the
**worst** window — so a chip can be coloured consistently with the license
activity chip next to it. `status === 'green'` and `met` are the same
condition; amber and red split "not ticked" into "close" and "not close",
which is UX, not regulation.

## What is deliberately still not modeled

- **Särskilda skäl** — unchanged from `compliance-fap551-spec.md`. The police
  grant it on an attachment; an app that let a shooter switch off their own
  requirement would model a decision that is not theirs.
- **Attestation.** On a paper log a row is evidence only once the _"Uppg.
  styrkta av"_ column is signed. The app has no equivalent and must not invent
  one, so a criterion reporting "6 sessions with this firearm" says the app
  counted them, never that anyone attested them. This is the same point as the
  blank **Attested by** column in the PDF export (#308), and it is why the UI
  carries an explicit note.
- **Which firearm a licence application is actually for.** The app evaluates
  every firearm the proxy covers, and the shooter reads off the one they are
  applying for.

## The screen has to explain its own number

`otherFirearmSessionCount` and `unattributedSessionCount` are not diagnostics;
they are what makes the figure believable. A shooter who logged 54 sessions in
the window and reads "0 of 2 activities with this firearm" will read it as a
bug unless the screen says where the other 54 went. Both counts are therefore
rendered whenever they are non-zero, not merely computed.

Found by driving the app, not by a test: the engine produced both from the
start and the card rendered only the unattributed one — which on real data is
the case that never fires.

## Constants (`constants-se.ts`)

| Constant                              | Value | Derivation                                              |
| ------------------------------------- | ----- | ------------------------------------------------------- |
| `SE_ADDITIONAL_HANDGUN_WINDOW_MONTHS` | `6`   | "under de senaste sex månaderna"                        |
| `SE_ADDITIONAL_HANDGUN_REQUIRED`      | `2`   | "minst två gånger"                                      |
| `SE_RENEWAL_WINDOW_MONTHS`            | `12`  | "per år"                                                |
| `SE_RENEWAL_WINDOW_COUNT`             | `2`   | "under de senaste två åren" — two of them, each checked |
| `SE_RENEWAL_REQUIRED_PER_WINDOW`      | `4`   | "minst fyra gånger per år"                              |

Criterion ids: `'additionalHandgun'`, `'renewal'`.

No number is written twice: `SE_RENEWAL_WINDOW_COUNT × SE_RENEWAL_WINDOW_MONTHS`
is the two years, and the spec does not also store a `24`.

## Behaviors

### `firearm-criteria.ts` — `F`

`computeFirearmCriterion(sessions, rule, firearm, now)`, one criterion against
one firearm. Sessions count when `session.firearmId === firearm.id` and the
instant falls in the window — never on weapon group, never on the shooter.

| #   | Scenario                                                            | Expected                                                                                                         |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F1  | 2 sessions with this firearm in six months, additional-handgun rule | `met: true`, `status: 'green'`, one period                                                                       |
| F2  | 1 session with this firearm, additional-handgun rule                | `met: false`, `status: 'amber'` (≥ ceil(2/2))                                                                    |
| F3  | 0 sessions with this firearm, additional-handgun rule               | `met: false`, `status: 'red'`                                                                                    |
| F4  | 5 sessions in the window, all with a **different** firearm          | `met: false`, `activityCount: 0`, `otherFirearmSessionCount: 5`                                                  |
| F5  | sessions with `firearmId: null` (not attributed)                    | never counted; reported in `unattributedSessionCount`                                                            |
| F6  | a session one day before the window opens                           | not counted                                                                                                      |
| F7  | a session dated after `now`                                         | not counted                                                                                                      |
| F8  | renewal rule, 4 in each of the two twelve-month windows             | `met: true`, two periods, both met                                                                               |
| F9  | renewal rule, 8 in the most recent window and 0 in the older one    | `met: false` — the decisive case; a 24-month total would say `true`                                              |
| F10 | renewal rule, 4 in the older window and 0 in the recent one         | `met: false`                                                                                                     |
| F11 | renewal rule, periods                                               | most recent first; `activityCount` is the **worst** window's                                                     |
| F12 | windows tile without gap or overlap                                 | period 1's `startIso` === period 2's `endIso`; a session exactly on that instant counts in the newer window only |
| F13 | `countsAs` weighting `{training: 1, competition: 0}`                | a competition session adds 0 to `activityCount` but 1 to `countedSessionCount`                                   |
| F14 | `requiredActivities: 0`                                             | `met: true`, `status: 'green'` with no sessions at all                                                           |

`computeFirearmCriteria(sessions, profile, firearm, now)` filters by
`appliesTo`:

| #   | Scenario                                      | Expected                                                           |
| --- | --------------------------------------------- | ------------------------------------------------------------------ |
| F15 | an owned pistol with no time-limited licence  | only `additionalHandgun`                                           |
| F16 | an owned pistol whose licence is time-limited | both criteria, in profile order                                    |
| F17 | a borrowed pistol                             | neither (nor renewal, unless its licence is time-limited)          |
| F18 | a rifle the shooter owns                      | neither — not an enhandsvapen                                      |
| F19 | an airgun the shooter owns                    | neither — `SE_HANDGUN_WEAPON_TYPES` excludes it                    |
| F20 | a firearm with `weaponType: null`             | neither; it cannot be shown to be a handgun                        |
| F21 | profile `'none'`                              | `[]` — no compliance UI exists without a profile                   |
| F22 | a rifle with a time-limited licence           | `renewal` only — the form's renewal criterion names no weapon type |

### Constants and profile — `C`

| #   | Scenario                                                | Expected                                                  |
| --- | ------------------------------------------------------- | --------------------------------------------------------- |
| C1  | the five new constants                                  | the values tabulated above                                |
| C2  | `SE_PROFILE.firearmCriteria`                            | two rules, ids `additionalHandgun` then `renewal`         |
| C3  | every firearm rule's numbers trace to `constants-se.ts` | no literal repeated in `profiles/se.ts`                   |
| C4  | both rules' `countsAs`                                  | `{ training: 1, competition: 1 }` — "tränat eller tävlat" |
| C5  | `getProfile('se', <either variant>)`                    | same `firearmCriteria` — they are not variant-dependent   |
| C6  | the 5 §/6 § rules                                       | unchanged: `windowMonths` 6, required 12 / 6              |

### Negative constraints

- N1: `shared/compliance` never imports from `app/`.
- N2: `months.ts` and `indicators.ts` are unmodified, and `license-activity.ts`
  changes only by importing the green/amber/red banding it used to hold
  privately. The banding moves to `status.ts` rather than being copied, so the
  two paths cannot drift — a copy is the one way the criteria chip and the
  license-activity chip could ever disagree about the same numbers. Verified by
  `git diff --stat`, recorded in EVIDENCE.
- N3: `LicenseActivity` gains no field. The 5 §/6 § screen is byte-identical
  in behaviour.
- N4: adding `firearmId` to `ComplianceSession` must not change any existing
  count — it is optional and only the new module reads it.
- N5: no number in the new code that is not derived from a cited constant or
  an app-level UX choice already documented (the green/amber/red banding).

## Gauntlet plan

- `pnpm check`.
- `pnpm coverage` — 100% threshold already covers
  `shared/src/compliance/**/*.ts`.
- `pnpm mutation` — `stryker.config.json` already mutates it; zero new
  survivors against the `origin/main` baseline.
- `mkdocs build --strict`, `node scripts/docs-translation-check.mjs` and
  `node scripts/docs-anchor-check.mjs` (the third gate, added in #343).
- No property-based tests: the domain is calendar arithmetic over a fixed set
  of five numbers, and the window-tiling edge is enumerated above (F6, F7,
  F9, F10, F12) rather than sampled.
- Real-execution layer: the firearm-detail screen driven on the emulator, with
  a screenshot, per CLAUDE.md's "verify by navigating the running app" rule.

## Out of scope

The PDF export's layout VERIFY, the Bilaga 8 märke-guld VERIFY, and
backfilling `sessions.firearm_id` on imported history — a session with no
firearm recorded is reported as such, not guessed at.
