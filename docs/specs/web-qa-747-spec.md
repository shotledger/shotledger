# Web QA fixes (#747): the shared entry limits — executable specification

> Old-coder SPEC for the part of #747 that changes `shared/src/sync-client/`
> (the web entry builders, which the phone's Rounds Fired field also calls).
> The page-level fixes of #747 (layout, accessibility, Statistics, the zip)
> are routine web changes with ordinary tests and are listed in the PR.
> Evidence: `docs/specs/web-qa-747-evidence.md`.
>
> **Approval status: NOT approved: written and built in one autonomous run.**
> The issue asked for limits "with an error" and left the numbers open; the
> chosen numbers are listed for the maintainer.

- **Tier: 2.** The builders decide what a push may carry. A wrong limit
  refuses a real session, or lets a typo reach every phone's Statistics.
- **Scope:** `session-entry.ts` (`nothingEntered`, `startedAtError`,
  `EARLIEST_STARTED_AT`), `rounds-entry.ts` (`MAX_ROUNDS_FIRED`, the shared
  date check), the phone's Rounds Fired message (`app/src/app/session/new.tsx`
  passes the maximum).
- **Not in scope:** the phone's own date picker, and its series entry, which
  are not built by these functions.

## 1. Key choices

**C1. A series entry with no shot in any row is refused (`nothingEntered`).**
Free format with every row blank, a fixed format's untouched skeleton, and a
blank sighter row all refuse, with nothing sent. A row that does not read
reports its own error instead, so the user is not told two things at once.
_Alternative:_ allow it, as the phone does when you back out of a new session.
Not recommended: the web cannot delete a session, so an empty one stays.

**C2. A start before 1900-01-01 UTC, or more than 24 hours after now, is
refused (`startedAtOutOfRange`),** for series and rounds-only entries alike.
24 hours covers every time zone's "today". _Alternative:_ a tighter lower
bound (1950). Not chosen: an old paper logbook is exactly what the web entry
is for.

**C3. Rounds Fired is at most 10,000 (`MAX_ROUNDS_FIRED`), on the web and the
phone**, since `parseRoundsFired` is shared (web-rounds-final-spec C4). Over
it is `invalidRounds`, and the message names the range.

**C4. With decimal scoring, a bare ring (`9`, `X`) stays refused**; the
message now says each shot needs its tenth. The parser is unchanged.
_Alternative:_ read `9` as `9.0`. Not chosen: it would guess at a missing
tenth in a mode whose point is the tenth.

## 2. Scenarios

```gherkin
Feature: session entry (shared/src/sync-client/session-entry.test.ts)
  Scenario: E2 no shot in any row is refused: nothingEntered
    Then rows [], ['', '  '] and one blank sighter, and a fixed format's blank skeleton, refuse
    And a row that does not read reports only its series error
    And one shot in a sighter row is something entered
  Scenario: E11 a firearm and 0 shots is nothing entered
  Scenario: E16 a start before 1900 or more than a day from now is refused
    Then 1899-12-31T23:59:59.999Z and 2999-01-01 refuse; 1900-01-01T00:00Z and now + 24 h
         pass; now + 24 h + 1 ms refuses

Feature: rounds entry (shared/src/sync-client/rounds-entry.test.ts)
  Scenario: RO2 "10000" reads as 10000; "10001", "2147483648" and 2^53 are invalid
  Scenario: RO6 (widened) a start in 1899 is startedAtOutOfRange
```

## 3. Must NOT

- **M1** No change to a valid entry's rows (#669's, #718's and #716's suites
  pass; only tests that pinned the old empty-session and huge-count behaviour
  changed: E2, E11, RO2; E15's example date moved, as it lay two days past the
  test clock).
- **M2** No new dependency, no protocol or schema change.

## 4. Revisions

None.
