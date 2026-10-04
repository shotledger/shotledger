# Sighter vs competition result — executable spec

Issue #573. The maintainer asked whether there is a relation, and perhaps
causality, between the sighter and the result in a competition. Their
decision (2026-10-04): the relation is shown from **10 competitions**; below
that, the card says how many more it needs.

Written before implementation; append-only during the task.

**Spec approval:** the maintainer, 2026-10-04, replying to the two spec
paths: "approved". They added an idea for later, a divided Statistics page,
filed as #588 and outside this spec.

- **Tier:** 2 (normal). A pure fold plus a Pearson correlation over in-memory
  series; no money, auth, concurrency or persistence.
- **Setup plan**
  - Isolation: branch `feat/stats-sighter-vs-result` off `origin/main` in
    the existing `findings` worktree. It is independent of #570's branch;
    the two share no files except the i18n JSON, the report screen and the
    Statistics guide, and conflicts there are additive.
  - Git: DCO-signed commits, spec committed first, then a commit per GREEN;
    one PR.
  - Tools to install: none.
  - New dependencies: none. `fast-check` is already a devDependency, and the
    scatter plot is drawn with `react-native-svg`, already a dependency.
  - Files added, by path:
    - `shared/src/scoring/sighter-relation.ts`
    - `shared/src/scoring/sighter-relation.test.ts`
    - `app/src/components/scatter-plot.tsx`
    - `docs/specs/sighter-vs-result-spec.md` (this file) and
      `docs/specs/sighter-vs-result-evidence.md`
  - Files changed: `shared/src/index.ts`, `app/src/app/stats/report.tsx`,
    `app/src/features/stats/use-stats-data.ts`, `app/src/i18n/{en,sv}.json`,
    `docs/manual/guides/statistics(.sv).md`,
    `docs/manual/explanation/how-sighters-count(.sv).md`.
  - Gauntlet: `pnpm check`, `pnpm mutation` scoped to the new file, and the
    app run on the emulator.

## The model

`sighterRelation(series)` takes the report's matched series and returns one
entry **per discipline**:

- **A qualifying competition** is a session with `sessionType: 'competition'`
  that has at least one sighter series with shot rows, and at least one
  non-sighter, non-final series with shot rows.
- **Its point** is `(sighterMeanShotTenths, resultMeanShotTenths)`:
  - the sighter is the mean per shot over all its sighter series' shots. An
    ISSF match has one sighter per stage, and they are pooled;
  - the result is the mean per shot over its non-sighter, non-final series.
    A final is shot only by the top shooters and is a separate contest.
  - Per shot rather than per series, so a session's series length does not
    matter. Imported total-only series have no shots, so they are not used.
- **Disciplines are never pooled.** A milsnabb shot and a precision shot
  average differently, and pooling them would invent a relation between
  disciplines rather than find one between sighter and result.
- **Not affected by the report's _Include sighters_ setting.** Sighters are
  the thing being measured here, and the result never includes them.
- Each entry: `disciplineId`, `points` (chronological, ties broken by
  session id), `competitionCount`, `neededMore` = max(0, 10 −
  `competitionCount`), and `correlation`:
  - `null` when `competitionCount` < 10 (`MIN_SIGHTER_COMPETITIONS = 10`),
    or when either the sighter or the result values are all equal (r is
    undefined);
  - otherwise `{ r, strength, direction }`, where `r` is Pearson's
    correlation coefficient;
  - `strength` by |r|: < 0.1 `none`, < 0.3 `weak`, < 0.5 `moderate`,
    ≥ 0.5 `strong`. These are Cohen's conventional cut-offs;
  - `direction`: `positive` when r > 0, `negative` when r < 0, and `null`
    when `strength` is `none`.
- Entries are ordered by `competitionCount` descending, then `disciplineId`.

## Scenarios

```gherkin
Scenario: SR1 a perfect positive relation
  Given 10 precision competitions whose result mean per shot equals the
        sighter mean per shot plus 0.5 (5.0 tenths)
  Then r is 1, strength is strong and direction is positive

Scenario: SR2 a perfect negative relation
  Given 10 competitions where the result falls exactly as the sighter rises
  Then r is -1, strength is strong and direction is negative

Scenario: SR3 below the minimum
  Given 9 qualifying competitions
  Then competitionCount is 9, neededMore is 1, correlation is null,
       and all 9 points are returned

Scenario: SR4 no variance
  Given 10 competitions whose sighters all average 9.0 per shot
  Then correlation is null

Scenario: SR5 what qualifies
  Given a training session with a sighter          -> not counted
  And a competition with no sighter                -> not counted
  And a competition whose sighter has no shot rows -> not counted
  And a competition with only a sighter and a final -> not counted
  Then none of them produces a point

Scenario: SR6 sighter and result values
  Given a competition with sighter shots 9, 8, 10, 9, 9 (mean 90 tenths)
  And series 10, 10, 9, 9, 8 and 9, 9, 9, 8, 8 and a final 10, 10, 10, 10, 10
  Then its point is (90, 89): the final is not in the result

Scenario: SR7 pooled stage sighters
  Given an ISSF competition with two sighter series, 5 shots each,
        averaging 80 and 100 tenths
  Then its sighter value is 90

Scenario: SR8 disciplines stay apart, ordered
  Given 12 qualifying precision and 10 qualifying milsnabb competitions
  Then there are two entries, precision first

Scenario: SR9 strength buckets
  Given computed r of 0.05, -0.2, 0.35, -0.7
  Then strength/direction are none/null, weak/negative, moderate/positive,
       strong/negative

Scenario: SR10 empty input
  Given no series, there are no entries
```

Plus fast-check properties over at least 10 random points: r stays within
[-1, 1]; r is unchanged by any positive linear rescaling of either axis; and
swapping the axes leaves r unchanged.

## UI (verified on the emulator, not by these tests)

- The card shows when the Type filter is **All** or **Competition**, for each
  discipline with at least one qualifying competition.
- A scatter plot: sighter average per shot across, match average per shot up,
  one dot per competition.
- Below 10: "Needs 3 more competitions with a sighter before it can say
  anything."
- From 10: one plain sentence from strength and direction, with r and the
  count. For example: "A better sighter goes with a better match, moderately
  (r = 0.42, 14 competitions)." For `none`: "The sighter says little about
  how the match goes (r = 0.04, 12 competitions)." For `negative`: "A better
  sighter goes with a worse match, weakly (…)."
- Always a caveat: "This shows whether the two go together, not that one
  causes the other: a good day, the weather or the range can lift both."
- The manual documents the card in the Statistics guide, and the
  explanation of how sighters count gains a short section on it.

## Must NOT

- Change any existing export or test in `shared/src/scoring/`.
- Count a sighter in the result, a final in the result, or a training session.
- Pool disciplines.
- Claim causation anywhere in the UI or the manual.
- Change the DB schema or add a dependency.

## Revisions

- (none yet)
