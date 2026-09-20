# Shooter-level license activity — executable spec

Scope: `shared/src/compliance/{types,license-activity,profiles/se}.ts` and the
app hook that reads them. Amends `compliance-fap551-spec.md`, which stands
unchanged on the numbers (six months, 12 and 6 activities, the
"sammantaget i genomsnitt" reading). Nothing here changes a threshold.

**Tier 2.** No money, auth, concurrency or data loss. The risk is the same one
the FAP 551-3 spec named — misstating a regulation — and it is addressed the
same way: by quoting the source and modeling only what it states.

**Maintainer ruling, 2026-09-20.** Asked how activity should be counted after
#319, the maintainer answered: _"The license activity is per owned weapon when
you apply for your 2nd and activity in general when you apply for your first."_
Offered three options, they chose **general level only for now** — fix the
counting, and file the per-firearm rules separately (#329).

## The defect

`profiles/se.ts` expressed 5–6 §§ as one rule listing every known weapon group,
and `computeRuleLicenseActivity` counted a session only when
`rule.weaponGroups.includes(session.weaponGroup ?? '')`.

Listing every group looks equivalent to "all sessions" and is not: a session
with **no** weapon group recorded matches no entry and is silently dropped. On
the maintainer's real 267-session import, 142 sessions carry no vapengrupp, so
the count was systematically low — and undercounting is the dangerous
direction, since it tells a shooter they are short of a requirement they may
already meet.

The same assumption reached the app: `loadOverallLicenseActivity` seeded the
computation from `listAllFirearmGroupIds(db)`, which an import never
populates, so the whole feature rendered nothing at all after a migration.

## The source, and why `shooter` is the faithful shape

PM 551.24 page 3, verbatim (both paragraphs share the wording):

> "under de senaste sex månaderna deltagit i föreningens skjutningar (träning
> eller tävling) och/eller representerat skytteföreningen i externa tävlingar
> sammantaget i genomsnitt minst [två / en] gång[er] per månad."

It names the person, the club's shooting and the window. It names **no weapon
group and no firearm**. The two criteria on the same form that _are_ per
firearm sit apart from this, under "Intyget avser", and are still unmodeled:

> "Sökanden har tränat eller tävlat minst två gånger under de senaste sex
> månaderna med respektive tidigare innehavt enhandsvapen"
> "Sökanden har tränat eller tävlat med sökt vapen minst fyra gånger per år
> under de senaste två åren"

Verified against three real completed föreningsintyg (2024 and 2026, supplied
by the maintainer outside the working tree — no content from them is
reproduced here): the per-firearm criteria appear only as "Intyget avser"
checkboxes, while "Aktiv medlem enligt 5/6 §" is ticked once for the applicant.

## Behaviors

A rule declares its `scope`, and the engine has exactly one branch on it.

| id  | Given                                                 | Then                                           |
| --- | ----------------------------------------------------- | ---------------------------------------------- |
| S1  | shooter rule, session with `weaponGroup: null`        | counts (1)                                     |
| S2  | shooter rule, sessions across several groups and none | all count                                      |
| S3  | shooter rule                                          | `skippedSessionCount` is 0 by construction     |
| S4  | shooter rule, session outside the window              | not counted — the window is unchanged          |
| S5  | shooter rule, **no** weapon groups passed             | still produces a status (the post-import case) |
| S6  | firearm with no weapon groups                         | gets the shooter-level status, not `null`      |
| S7  | weaponGroups rule                                     | reports `skippedSessionCount`, in-window only  |
| S8  | weights ≠ 1                                           | `countedSessionCount` stays unweighted         |
| P3  | either SE variant                                     | exactly one rule, `scope: 'shooter'`           |
| P3b | that rule, one session per known group plus one none  | every session counts, none skipped             |

`skippedSessionCount` is counted **inside the window only**. A screen that
said "1 240 sessions not counted" because it had reached back over a shooter's
whole history would be technically true and useless.

## Not in scope

- The two per-firearm criteria (#329). The engine is now shaped to take them:
  a third scope, keyed on `session.firearm_id`, slots in beside these two
  without touching the shooter path.
- Any threshold, window or weighting. Untouched.
- `firearm_groups` as a concept: weapon groups still exist and still drive
  everything else that uses them. They simply no longer gate 5–6 §§.
