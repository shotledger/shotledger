# FAP 551-3 activity numbers — executable spec

Scope: `shared/src/compliance/**` (old-coder mandatory per CLAUDE.md), plus
the app-layer setting and UI that lets the shooter pick which paragraph
applies to them. Supersedes the **numeric** part of
`m6-compliance-spec.md` — the VERIFY placeholders it shipped
(`windowMonths: 6`, `requiredActivities: 4`, `SE_VERIFIED = false`). Everything
else in that spec (activity definition, rolling window, status banding,
Bilaga 8 indicators) stands unchanged and is not restated here.

**Spec approval: not obtained (autonomous run).** The maintainer's 2026-09-16
decisions (source document, which paragraphs to model, which to transcribe
only) are _inputs_ to this spec, not approval of it. This document is the
artifact for review after the fact, per the old-coder skill's autonomous-mode
provision.

**Tier 2** (normal feature). No money, auth, concurrency or data loss. The
one real risk is misstating a regulation, which no gauntlet layer can catch —
it is addressed by transcribing the source verbatim below, citing it at every
place a number appears, and modelling only what the source actually states.

**Isolation:** the agent's own git worktree, branch
`fix/compliance-fap551-numbers`.

**Setup plan:** no new dependencies. No new tooling. Files touched by path:

- `shared/src/compliance/constants-se.ts` (rewritten)
- `shared/src/compliance/types.ts`, `profiles/se.ts`, `profile-registry.ts`,
  `index.ts` (profile-variant mechanism)
- `shared/src/compliance/profile-registry.test.ts`,
  `constants-se.test.ts` (new)
- `app/src/db/queries/settings.ts` (new settings key)
- `app/src/features/compliance/{profile.ts,use-compliance-profile.ts}`
- `app/src/app/settings/compliance.tsx`, `app/src/app/firearms/[id]/index.tsx`
- `app/src/i18n/{en,sv}.json`
- `docs/manual/guides/licence-activity{,.sv}.md`,
  `docs/implementation-plan.md`, `docs/specs/m6-compliance-spec.md`

## The source

Polismyndigheten's form **PM 551.24 "Föreningsintyg"**, page 3, "Förklaringar
och anvisningar vid utfärdande av föreningsintyg", which transcribes the
requirements set in **PMFS 2016:4 / RPSFS 2009:13, FAP 551-3, 5 kap 5–6 §§**.

<https://polisen.se/b9596e33879c4925472a5edb9c451ab1/siteassets/blanketter/polisens-blanketter-551-24.pdf>

Downloaded and read (page 3, `pdftotext -layout`) while writing this spec; the
PDF itself is deliberately not in the repo. Verbatim, the four numeric
statements on that page:

1. **5 §** — "Aktiv medlem enligt 5 § - för den som inte tidigare har
   enhandsvapen för målskjutning." / "5 § under de senaste sex månaderna
   deltagit i föreningens skjutningar (träning eller tävling) och/eller
   representerat skytteföreningen i externa tävlingar sammantaget i genomsnitt
   minst två gånger per månad."
2. **6 §** — "Aktiv medlem enligt 6 § - för den som sedan tidigare innehar
   enhandsvapen för målskjutning." / "6 § under de senaste sex månaderna
   deltagit i föreningens skjutningar (träning eller tävling) och/eller
   representerat skytteföreningen i externa tävlingar, sammantaget i genomsnitt
   minst en gång per månad."
3. **Ytterligare enhandsvapen** — "ange med kryss i rutan om sökanden har
   tränat eller tävlat minst två gånger under de senaste sex månaderna med
   respektive tidigare innehavda enhandsvapen."
4. **Förnyelse av tidsbegränsat tillstånd** — "ange med kryss i rutan om
   sökanden har tränat eller tävlat med sökt vapen minst fyra gånger per år
   under de senaste två åren."

Plus, non-numeric: "Undantag enligt 6 § första stycket kan göras för den som
tidigare är aktiv medlem om det finns särskilda skäl så som t.ex. sjukdom,
graviditet, eller utlandstjänstgöring. Särskilda skäl ska redovisas i bilaga."
and "Det är alltid Polismyndigheten som avgör…".

## What is modelled, and what is not

**Modelled: 5 § and 6 § only.** They are the two general "aktiv medlem"
requirements, they share one shape (a count of activities over a six-month
window), and they map onto exactly what the app already knows — logged
sessions.

**Transcribed but not modelled**, by the maintainer's decision of 2026-09-16,
same treatment as the SvSF klass layer in #138:

- **Ytterligare enhandsvapen** (≥2 activities in six months _with each
  previously held handgun_). Not modelled: it is a per-firearm requirement
  keyed to which handguns the applicant already holds — a licence-holding fact
  the app does not record, and it applies only to a specific application type,
  not to a shooter's standing activity level.
- **Förnyelse av tidsbegränsat tillstånd** (≥4 activities per year over the
  last two years _with the applied-for firearm_). Not modelled: it is keyed to
  a permit's time-limited status, which the app does not record either.
- **Särskilda skäl** (illness, pregnancy, service abroad). Not modelled, and
  deliberately so: the form says the exception is granted by Polismyndigheten
  on a separate attachment, not asserted by the shooter or their club. An app
  that let a shooter switch off their own barometer on these grounds would be
  modelling a decision that is not theirs to make.

All three are stated in the user manual, so a shooter reading it learns the
rule exists and that this app does not track it.

## The reading of "sammantaget i genomsnitt minst N gånger per månad"

Three readings are possible for "on average at least two per month over the
last six months", and they differ at the edges:

- **(a) total over the window** — at least `N × windowMonths` activities in
  the whole six-month window, however distributed.
- **(b) per calendar month** — at least `N` in every one of the six months.
- **(c) trailing average per month** — some rolling per-month average.

**Binding: reading (a).** The form says _"sammantaget i genomsnitt"_ —
"in total, on average". "Sammantaget" is what rules out (b): a month-by-month
requirement is the opposite of taking the months together, and the word would
be meaningless under it. "I genomsnitt" over a stated window of six months is
arithmetically the total divided by six, which is (a). The form states no other
distribution constraint, and this spec does not invent one.

Consequence, stated plainly because it is the edge the reading decides:
**twelve activities in one week and none for five months satisfies 5 § as
modelled here.** That is what the form's words say. The police decide the
actual application; the app counts.

## Constants (`constants-se.ts`)

| Constant                                  | Value  | Derivation                                          |
| ----------------------------------------- | ------ | --------------------------------------------------- |
| `SE_WINDOW_MONTHS`                        | `6`    | "under de senaste sex månaderna" (both §§)          |
| `SE_FIRST_HANDGUN_PER_MONTH`              | `2`    | 5 §: "minst två gånger per månad"                   |
| `SE_EXISTING_HANDGUN_PER_MONTH`           | `1`    | 6 §: "minst en gång per månad"                      |
| `SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES`    | `12`   | `SE_FIRST_HANDGUN_PER_MONTH × SE_WINDOW_MONTHS`     |
| `SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES` | `6`    | `SE_EXISTING_HANDGUN_PER_MONTH × SE_WINDOW_MONTHS`  |
| `SE_VERIFIED`                             | `true` | both modelled numbers now trace to the cited source |

The two required-activity counts are **computed from** the per-month rate and
the window, not written as literals — the average reading is then visible in
the code rather than only in this document.

`countsAs` stays `{ training: 1, competition: 1 }`: the form counts
"föreningens skjutningar (träning eller tävling) och/eller representerat
skytteföreningen i externa tävlingar" as one pool, with no weighting between
them.

`SE_VERIFIED = true` covers **only the 5 §/6 § numbers**. The Bilaga 8
märke-guld indicator keeps its own separate `ruleVerified: false`, unchanged
by this spec.

## The profile-variant mechanism

Which paragraph applies is a property of the shooter — whether they already
hold a handgun for target shooting — not something the app can derive. It is a
new **profile variant** the shooter selects, kept general rather than
Swedish-specific:

```ts
interface ComplianceProfileVariant {
  id: string; // opaque to shared/; the app maps it to an i18n label
  rules: WeaponGroupComplianceRule[];
}

interface JurisdictionProfileDefinition {
  id: JurisdictionProfileId;
  name: { sv: string; en: string };
  variants: ComplianceProfileVariant[];
  defaultVariantId: string;
  source: string;
  verified: boolean;
}
```

`getProfile(selection, variantId?)` resolves a definition to the existing
`JurisdictionProfile` shape (now carrying `variantId`) whose `rules` are the
selected variant's. `barometer.ts` is unchanged: it still consumes
`profile.rules` and knows nothing about variants or Sweden.

SE variant ids: `'firstHandgun'` (5 §) and `'existingHandgun'` (6 §).

**Default: `'firstHandgun'` (the stricter, 12).** Fail-safe: the stricter
requirement can show red to someone who is in fact compliant under 6 §, which
sends them to look; the lax one would show green to someone who is not
compliant under 5 §, which does not. The chosen case is written to
`settings.complianceProfileVariant` and shown on the barometer card, so the
app never silently applies a case the shooter did not see. **Flagged for
maintainer review** — a UX default, not a regulatory fact.

## Behaviors

### `constants-se.ts` — `C`

| #   | Scenario                                  | Expected                                                                                  |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| C1  | `SE_WINDOW_MONTHS`                        | `6`                                                                                       |
| C2  | `SE_FIRST_HANDGUN_REQUIRED_ACTIVITIES`    | `12`, and `=== SE_FIRST_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS`                             |
| C3  | `SE_EXISTING_HANDGUN_REQUIRED_ACTIVITIES` | `6`, and `=== SE_EXISTING_HANDGUN_PER_MONTH * SE_WINDOW_MONTHS`                           |
| C4  | `SE_VERIFIED`                             | `true`                                                                                    |
| C5  | `SE_SOURCE_CITATION`                      | names PM 551.24 and FAP 551-3 5 kap 5–6 §§, and carries no "VERIFY"/"placeholder" wording |

### `profile-registry.ts` / `profiles/se.ts` — `P`

| #   | Scenario                                                    | Expected                                                                                    |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P1  | `getProfile('se')` with no variant                          | the SE profile, `verified: true`, `variantId: 'firstHandgun'` (default)                     |
| P2  | `getProfile('none')`, any variant argument                  | `null`                                                                                      |
| P3  | every v1 weapon group (SPSF + generic) under either variant | resolves to exactly one rule                                                                |
| P4  | rules trace to `constants-se.ts`, no duplicated literals    | `windowMonths === SE_WINDOW_MONTHS` for every rule of both variants                         |
| P5  | `getProfile('se', 'firstHandgun')`                          | every rule `requiredActivities === 12`                                                      |
| P6  | `getProfile('se', 'existingHandgun')`                       | every rule `requiredActivities === 6`                                                       |
| P7  | `getProfile('se', 'not-a-variant')`                         | falls back to the default variant — never `null`, never throws, never a fabricated rule set |
| P8  | `getProfileDefinition('se')`                                | two variants, `defaultVariantId` names one of them                                          |
| P9  | `getProfileDefinition('none')`                              | `null`                                                                                      |
| P10 | both variants' `countsAs`                                   | `{ training: 1, competition: 1 }`                                                           |

### Barometer under the real numbers — `R`

Boundary cases of the chosen reading (a), through the unchanged
`computeRuleBarometer`:

| #   | Scenario (window = 6 months, `now` fixed)                          | Expected                                                                               |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| R1  | 12 sessions in the window, `firstHandgun`                          | `green` (count === required)                                                           |
| R2  | 11 sessions in the window, `firstHandgun`                          | `amber` (≥ ceil(12/2) = 6)                                                             |
| R3  | 5 sessions in the window, `firstHandgun`                           | `red` (< 6)                                                                            |
| R4  | 6 sessions in the window, `existingHandgun`                        | `green`                                                                                |
| R5  | the same 6 sessions under `firstHandgun`                           | `amber` — the case changes the verdict, and only the shooter's choice changes the case |
| R6  | 12 sessions all inside one week of the window, `firstHandgun`      | `green` — the total-over-window reading (a), stated above, made executable             |
| R7  | 12 sessions spread as 2/month, one of them a day before the window | `amber` — 11 counted; the window is what bounds it                                     |

### Negative constraints

- N1: `shared/compliance` never imports from `app/` (unchanged).
- N2: `barometer.ts`, `months.ts` and `indicators.ts` are not modified by this
  change — the variant mechanism must not leak Swedish rules into shared
  machinery other profiles use. Verified by `git diff --stat`, recorded in
  EVIDENCE.
- N3: no number in `shared/src/compliance/` that is not either derived from a
  cited constant or an app-level UX choice already documented in
  `m6-compliance-spec.md` (the green/amber/red banding).
- N4: the existing `shared/scoring`, `shared/disciplines` and app DB suites
  stay green and untouched.
- N5: `profile.verified` and the `unverifiedHint` UI guard stay in place —
  `se` is verified now, but `verified` is a general profile field and the
  guard is the general mechanism, not SE-specific dead code. The string is
  reworded so it no longer names FAP 551-3.

## Gauntlet plan

- `pnpm check` (typecheck ×2, schema:check, i18n:check, licenses:check, lint,
  format, vitest, app jest).
- `pnpm coverage` — 100% threshold already covers
  `shared/src/compliance/**/*.ts`; exits nonzero when missed.
- `pnpm mutation` — `stryker.config.json` already mutates
  `shared/src/compliance/**/*.ts`; break threshold 95.
- `mkdocs build --strict` and `node scripts/docs-translation-check.mjs` (not in
  `pnpm check`; CI's _Build (strict)_ job runs both).
- No property-based tests: the domain is a fixed lookup of four numbers and
  calendar arithmetic already covered by `m6`'s boundary tables.
- No real-execution layer on the emulator (machine shared, explicitly
  forbidden by the task brief) — recorded as skipped with that reason in
  EVIDENCE.

## Out of scope

The PDF export's layout VERIFY, the Bilaga 8 märke-guld VERIFY, the
locale-based profile default, and the barometer's green/amber/red banding.
All unchanged, all still carrying their own flags.
