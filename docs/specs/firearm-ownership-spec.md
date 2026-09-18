# Firearm ownership and the derived FAP 551-3 case — executable spec

Issue [#286](https://github.com/jimisola/shotledger/issues/286). Follow-up to
#281, whose spec is `compliance-fap551-spec.md`; everything there stands
unchanged except the sentence "which the app cannot derive" — this change
derives the **default**, and nothing else.

**Spec approval: not obtained (autonomous run).** The maintainer's wording in
#286 ("if we add a boolean to all firearms whether this is the shooters own
firearm or not then we could actually choose default") is an _input_ to this
spec, not approval of it. This document is the artifact for review after the
fact, per the old-coder skill's autonomous-mode provision.

**Tier 2** (normal feature). No money, auth, concurrency. The two real risks
are (1) misstating a regulation and (2) silently relaxing a requirement under
a shooter who never asked for it. Both are addressed below by construction,
not by a gauntlet layer.

**Isolation:** a git worktree at `/home/jimisola/tmp/shotledger-wt-ownflag`,
branch `feat/firearm-own-flag` off `origin/main` — the repo's own working tree
is checked out on another session's `feat/remove-vault`. `pnpm i` was run
there; every gate below runs in that worktree.

## The rule being modelled

FAP 551-3 5 kap, as transcribed on page 3 of PM 551.24:

- **5 §** — "för den som inte tidigare har **enhandsvapen** för målskjutning":
  on average ≥2 activities/month over six months (12 in the window).
- **6 §** — "för den som sedan tidigare **innehar enhandsvapen** för
  målskjutning": ≥1/month (6 in the window).

The distinguishing fact is therefore: *does the shooter already hold a
**handgun** for target shooting?* Two consequences the issue already names:

- The derivation must read the weapon **type**. An owned rifle is not an
  enhandsvapen and does not make the shooter a 6 § case.
- It must read **ownership**. A borrowed or club-owned handgun is not held by
  the shooter.

### Which weapon types count as `enhandsvapen` here

`pistol` and `revolver` only. `rifle` is not a handgun. `airgun` is a separate
`weapon_type` in this app covering air pistols and air rifles alike, and a
Swedish air pistol below the licensing threshold is not a *held* enhandsvapen
in the sense 6 § uses; the app cannot tell the two apart from what it records.
Excluding `airgun` therefore keeps a shooter on the **stricter** 5 § default,
which is the fail-safe direction (see #281's spec). This is a deliberately
conservative app-level choice, **not** a claim about what the police count.

## Why the column is nullable, and why a migration must not fill it in

`firearms.is_own` is tri-state: `1` own, `0` borrowed / club-owned / another
person's, **`NULL` not stated**.

The migration leaves every existing row `NULL`. Defaulting existing rows to
"own" would invent a fact about the user's firearms, and it would invent it in
the one direction that *relaxes* the requirement — an installed shooter with a
pistol on file would silently drop from 12 required activities to 6 without
ever having been asked. `NULL` derives to 5 §, the stricter case, exactly as
today. Nothing about an existing install changes until the shooter says so.

New firearms are created with `is_own = 1` preselected in the form: it is the
common case, it is visible and changeable on screen before saving, and it is
the shooter stating it rather than a migration guessing it.

## Derivation, and what it may never do

```
effective case = explicit Settings choice
              ?? derived default from the firearms
              ?? profile default
```

- An explicit `settings.complianceProfileVariant` row **always** wins. The
  derivation is consulted only when that row is absent.
- The derivation returns `existingHandgun` (6 §) iff at least one non-deleted
  firearm has `is_own = 1` **and** a handgun weapon type; otherwise
  `firstHandgun` (5 §).
- Nothing writes `complianceProfileVariant` on the shooter's behalf. The
  derived value is a default resolved at read time, so a later firearm edit
  moves it — which is the point — while a shooter who has chosen is untouched.

## Setup plan

No new dependencies. No new tooling. Files touched, by path:

- `app/src/db/schema.ts` — `firearms.isOwn`
- `app/src/db/migrations/0002_firearm_is_own.sql`, `meta/0002_snapshot.json`,
  `meta/_journal.json`, `migrations.js` (numbered **0002**: PR #296 already
  claims `0001_drop_vault_document_id` on an open branch)
- `app/src/db/queries/firearms.ts` — `isOwn` on create/update,
  `listFirearmOwnershipFacts`
- `shared/src/compliance/types.ts` — `FirearmOwnershipFact`,
  `JurisdictionProfileDefinition.deriveDefaultVariantId`
- `shared/src/compliance/profiles/se.ts` — `SE_HANDGUN_WEAPON_TYPES`,
  `deriveSeVariantId`
- `shared/src/compliance/profile-registry.ts` — `resolveDefaultVariantId`
- `shared/src/compliance/index.ts` — exports
- `app/src/features/compliance/use-compliance-profile.ts` — facts + explicitness
- `app/src/app/settings/compliance.tsx` — "derived" hint
- `app/src/app/firearms/new.tsx`, `[id]/edit.tsx`, `[id]/index.tsx` — the field
- `app/src/i18n/{en,sv}.json`
- `docs/manual/guides/firearms-and-ammunition{,.sv}.md`,
  `docs/manual/guides/licence-activity{,.sv}.md`
- `docs/implementation-plan.md`, new tests alongside the files above

## Behaviors

### SE derivation — `D` (`shared/src/compliance/profiles/se.test.ts`)

| #   | Facts                                                     | Expected           |
| --- | --------------------------------------------------------- | ------------------ |
| D1  | no firearms at all                                        | `firstHandgun`     |
| D2  | owned `pistol`                                            | `existingHandgun`  |
| D3  | owned `revolver`                                          | `existingHandgun`  |
| D4  | owned `rifle` only                                        | `firstHandgun`     |
| D5  | owned `airgun` only                                       | `firstHandgun`     |
| D6  | `pistol` with `isOwn: false`                              | `firstHandgun`     |
| D7  | `pistol` with `isOwn: null` (not stated)                  | `firstHandgun`     |
| D8  | owned firearm with `weaponType: null`                     | `firstHandgun`     |
| D9  | borrowed pistol + owned rifle + owned pistol              | `existingHandgun`  |
| D10 | borrowed pistol + owned rifle, no owned handgun           | `firstHandgun`     |

### Registry — `V` (`shared/src/compliance/profile-registry.test.ts`)

| #  | Scenario                                                      | Expected                                            |
| -- | ------------------------------------------------------------- | --------------------------------------------------- |
| V1 | `resolveDefaultVariantId('none', anything)`                   | `null`                                              |
| V2 | `resolveDefaultVariantId('se', [])`                           | `firstHandgun`                                      |
| V3 | `resolveDefaultVariantId('se', [owned pistol])`               | `existingHandgun`                                   |
| V4 | `resolveDefaultVariantId('se')` — facts omitted               | `firstHandgun` (no facts is not "owns a handgun")   |
| V5 | a definition without `deriveDefaultVariantId`                 | falls back to `defaultVariantId`                    |
| V6 | `getProfile('se', resolveDefaultVariantId('se', [owned pistol]))` | rules require 6 activities                      |
| V7 | `getProfile`/`getProfileDefinition` behaviour                 | unchanged — P1–P10 of the #281 spec still pass      |

### Query layer — `Q` (`app/src/db/queries/firearms.test.ts`)

| #  | Scenario                                                             | Expected                                       |
| -- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Q1 | `createFirearm` with no `isOwn`                                      | row has `isOwn: null` — never a fabricated `true` |
| Q2 | `createFirearm({ isOwn: true })` / `false`                           | round-trips as `true` / `false`                 |
| Q3 | `updateFirearm(id, { isOwn: false })`                                | persists; other columns untouched               |
| Q4 | `listFirearmOwnershipFacts`                                          | one `{ weaponType, isOwn }` per non-deleted firearm |
| Q5 | a soft-deleted firearm                                               | absent from the facts                           |

### Negative constraints

- N1: `shared/compliance` still imports nothing from `app/`.
- N2: `licence-activity.ts`, `months.ts`, `indicators.ts`, `constants-se.ts`
  are **not modified** — no regulatory number changes in this PR. Verified by
  `git diff --stat`, recorded in EVIDENCE.
- N3: no migration writes a value into `is_own` for an existing row. Verified
  by reading the generated SQL and by a migration-chain test.
- N4: nothing in the app writes `settings.complianceProfileVariant` except the
  Settings picker's `onChange`. Verified by `grep` over `app/src`, recorded.
- N5: an explicit stored variant still wins over the derivation.
- N6: the existing suites (`shared/scoring`, `shared/disciplines`, app DB,
  migration chain) stay green.

## Gauntlet plan

`pnpm check`, `pnpm coverage`, `pnpm mutation`, `mkdocs build --strict`,
`node scripts/docs-translation-check.mjs`. No emulator and no Gradle (machine
shared; forbidden by the task brief) — recorded as skipped with that reason.
UI confirmed on the Expo web preview instead, or recorded as not confirmed.

## Out of scope — reported back, not decided

Whether the flag is also useful in the **föreningsintyg PDF** or the **log**
(#286's third open question). That is a product decision; this PR implements
the compliance input only and leaves the question open.
