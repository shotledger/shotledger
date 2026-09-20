# Firearm ownership and the derived FAP 551-3 case — executable spec

Issue [#286](https://github.com/jimisola/shotledger/issues/286). Follow-up to
#281, whose spec is `compliance-fap551-spec.md`; everything there stands
unchanged except the sentence "which the app cannot derive" — this change
derives the **default**, and nothing else.

**Revised 2026-09-18 on a maintainer decision.** Asked about the tri-state
this spec originally argued for, the maintainer ruled: _"the ownership should
default to yes/true"_, and, asked whether the "Not Specified" state goes away
entirely, _"yes, drop it. Plain boolean."_ That decision replaces the
"Why the column is nullable" section below; the consequence it carries is
stated there.

**Spec approval: not obtained (autonomous run).** The maintainer's wordings in
#286 and above are _inputs_ to this spec, not approval of it. This document is
the artifact for review after the fact, per the old-coder skill's
autonomous-mode provision.

**Tier 2** (normal feature). No money, auth, concurrency. The two real risks
are (1) misstating a regulation and (2) silently relaxing a requirement under
a shooter who never asked for it. Both are addressed below by construction,
not by a gauntlet layer.

**Isolation:** a git worktree at `/home/jimisola/tmp/shotledger-wt-ownflag`,
branch `feat/firearm-own-flag` off `origin/main` — the repo's own working tree
is checked out on another session's `feat/remove-vault`. `pnpm i` was run
there; every gate below runs in that worktree.

## The rule being modeled

FAP 551-3 5 kap, as transcribed on page 3 of PM 551.24:

- **5 §** — "för den som inte tidigare har **enhandsvapen** för målskjutning":
  on average ≥2 activities/month over six months (12 in the window).
- **6 §** — "för den som sedan tidigare **innehar enhandsvapen** för
  målskjutning": ≥1/month (6 in the window).

The distinguishing fact is therefore: _does the shooter already hold a
**handgun** for target shooting?_ Two consequences the issue already names:

- The derivation must read the weapon **type**. An owned rifle is not an
  enhandsvapen and does not make the shooter a 6 § case.
- It must read **ownership**. A borrowed or club-owned handgun is not held by
  the shooter.

### Which weapon types count as `enhandsvapen` here

`pistol` and `revolver` only. `rifle` is not a handgun. `airgun` is a separate
`weapon_type` in this app covering air pistols and air rifles alike, and a
Swedish air pistol below the licensing threshold is not a _held_ enhandsvapen
in the sense 6 § uses; the app cannot tell the two apart from what it records.
Excluding `airgun` therefore keeps a shooter on the **stricter** 5 § default,
which is the fail-safe direction (see #281's spec). This is a deliberately
conservative app-level choice, **not** a claim about what the police count.

## Why the column is a plain boolean defaulting to true

`firearms.is_own` is `NOT NULL DEFAULT 1` — `1` own, `0` borrowed /
club-owned / another person's. There is no "not stated" state. Maintainer's
decision, 2026-09-18, quoted above.

An earlier draft of this spec argued for a third `NULL` state so that the
migration would not invent a fact about an existing firearm. That argument is
withdrawn, not merely overruled: the maintainer is the one shooter whose
firearms these are, owning is the overwhelmingly common case, and a state
whose only purpose is "the app has not asked yet" buys a third segment on the
form and a conditional on the detail screen for a distinction nobody makes.

**The consequence, stated plainly.** The migration backfills every existing
row to `1`, so the app now assumes a shooter owns a handgun on file unless
they say otherwise, and the derived **default** for such a shooter becomes
**6 §** — the _lighter_ requirement (6 activities in the window rather than
12). That is the opposite direction from #281's fail-safe default, and it is
deliberate. What does not change: the explicit Settings → Compliance choice
still wins, is still never written on the shooter's behalf, and is still never
overwritten by a firearm edit. A shooter whose handgun is not their own sets
that firearm to **Borrowed** and returns to 5 §.

New firearms are created with **My Own** preselected in the form — visible and
changeable on screen before saving.

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
  `firstHandgun` (5 §). Since `is_own` defaults to `1`, any handgun on file
  derives 6 § until the shooter marks it borrowed.
- Nothing writes `complianceProfileVariant` on the shooter's behalf. The
  derived value is a default resolved at read time, so a later firearm edit
  moves it — which is the point — while a shooter who has chosen is untouched.

## Setup plan

No new dependencies. No new tooling. Files touched, by path:

- `app/src/db/schema.ts` — `firearms.isOwn` (`.notNull().default(true)`)
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
  `docs/manual/guides/license-activity{,.sv}.md`
- `docs/implementation-plan.md`, new tests alongside the files above

## Behaviors

### SE derivation — `D` (`shared/src/compliance/profiles/se.test.ts`)

| #   | Facts                                           | Expected          |
| --- | ----------------------------------------------- | ----------------- |
| D1  | no firearms at all                              | `firstHandgun`    |
| D2  | owned `pistol`                                  | `existingHandgun` |
| D3  | owned `revolver`                                | `existingHandgun` |
| D4  | owned `rifle` only                              | `firstHandgun`    |
| D5  | owned `airgun` only                             | `firstHandgun`    |
| D6  | `pistol` with `isOwn: false`                    | `firstHandgun`    |
| D7  | owned firearm with `weaponType: null`           | `firstHandgun`    |
| D8  | borrowed pistol + owned rifle + owned pistol    | `existingHandgun` |
| D9  | borrowed pistol + owned rifle, no owned handgun | `firstHandgun`    |

### Registry — `V` (`shared/src/compliance/profile-registry.test.ts`)

| #   | Scenario                                                          | Expected                                          |
| --- | ----------------------------------------------------------------- | ------------------------------------------------- |
| V1  | `resolveDefaultVariantId('none', anything)`                       | `null`                                            |
| V2  | `resolveDefaultVariantId('se', [])`                               | `firstHandgun`                                    |
| V3  | `resolveDefaultVariantId('se', [owned pistol])`                   | `existingHandgun`                                 |
| V4  | `resolveDefaultVariantId('se')` — facts omitted                   | `firstHandgun` (no facts is not "owns a handgun") |
| V5  | a definition without `deriveDefaultVariantId`                     | falls back to `defaultVariantId`                  |
| V6  | `getProfile('se', resolveDefaultVariantId('se', [owned pistol]))` | rules require 6 activities                        |
| V7  | `getProfile`/`getProfileDefinition` behavior                      | unchanged — P1–P10 of the #281 spec still pass    |

### Query layer — `Q` (`app/src/db/queries/firearms.test.ts`)

| #   | Scenario                                   | Expected                                            |
| --- | ------------------------------------------ | --------------------------------------------------- |
| Q1  | `createFirearm` with no `isOwn`            | row has `isOwn: true` — the column's default        |
| Q2  | `createFirearm({ isOwn: true })` / `false` | round-trips as `true` / `false`                     |
| Q3  | `updateFirearm(id, { isOwn: false })`      | persists; other columns untouched                   |
| Q4  | `listFirearmOwnershipFacts`                | one `{ weaponType, isOwn }` per non-deleted firearm |
| Q5  | a soft-deleted firearm                     | absent from the facts                               |

### App case resolution — `C` (`app/src/features/compliance/resolve-case.test.ts`)

| #   | Stored choice / firearms                                                         | Expected                        |
| --- | -------------------------------------------------------------------------------- | ------------------------------- |
| C1  | profile `none`, owned pistol                                                     | no case, not explicit           |
| C2  | none stored, borrowed pistol                                                     | `firstHandgun`, not explicit    |
| C3  | none stored, owned pistol                                                        | `existingHandgun`, not explicit |
| C4  | `firstHandgun` stored + owned pistol; and `existingHandgun` stored + no firearms | the stored one, explicit        |
| C5  | a stored id the profile no longer offers                                         | falls through to the derivation |

**Revision, during implementation.** C5 was first written as "an unknown
stored id resolves to `firstHandgun`" — the profile's declared
`defaultVariantId`, which is what `getProfile` does with an unknown variant.
That is wrong once a derivation exists: the rule is "no usable choice ⇒ the
**default**", and the default is now the derived one. C5 asserts the
derivation, and `resolveComplianceCase` resolves the definition itself rather
than laundering an unknown id through `getProfile`. `getProfile`'s own
unknown-id behavior (P7) is unchanged.

### Negative constraints

- N1: `shared/compliance` still imports nothing from `app/`.
- N2: `license-activity.ts`, `months.ts`, `indicators.ts`, `constants-se.ts`
  are **not modified** — no regulatory number changes in this PR. Verified by
  `git diff --stat`, recorded in EVIDENCE.
- N3: the migration backfills every pre-existing `firearms` row to `is_own = 1`
  (N3b: and a later insert that states nothing gets `1` too). Verified by
  reading the generated SQL and by a migration-chain test.
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
