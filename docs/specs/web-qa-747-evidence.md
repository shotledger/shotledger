# Evidence report — the shared entry limits of #747 (Tier 2)

Spec: [`web-qa-747-spec.md`](web-qa-747-spec.md).

- **Spec approval: not obtained (autonomous run).** The limits (1900, a day
  ahead, 10,000 rounds) are choices for the maintainer, listed in the PR.
- **Source state:** code at `704ec253` on `fix/747-web-qa`, from `origin/main`
  at `41b1b7fe`. Every number below is from that state; this report and the
  spec are the only later changes.
- **Independent verification: not performed** (a declared downgrade).

## Spec → test mapping

| Scenario                                    | Test                                                                     | Status |
| ------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| E2 nothing entered is refused               | `shared/src/sync-client/session-entry.test.ts` › E2 (no shot in any row) | pass   |
| E11 a firearm and 0 shots                   | `session-entry.test.ts` › E11 (second test)                              | pass   |
| E16 the date range and its bounds           | `session-entry.test.ts` › E16                                            | pass   |
| RO2 the 10,000 cap                          | `shared/src/sync-client/rounds-entry.test.ts` › RO2                      | pass   |
| RO6 a rounds entry's date range             | `rounds-entry.test.ts` › RO6                                             | pass   |
| C4 the decimal message                      | browser check (the page's message; the parser is unchanged)              | pass   |
| M1 valid entries unchanged                  | #669, #716 and #718 suites green in `pnpm check`                         | pass   |
| M2 no dependency, protocol or schema change | diff: no `package.json`, lockfile, `shared/src/sync/` or schema change   | pass   |

## Gauntlet

| Layer         | Command                                                                                                                     | Result                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm check`  | types, lint, format, i18n, licenses, vitest with the coverage gate, jest                                                    | exit 0; vitest 201 files, 3281 tests; 100% statements, branches, functions, lines; jest 66 suites, 726 |
| Mutation      | `npx stryker run --mutate "shared/src/sync-client/session-entry.ts,shared/src/sync-client/rounds-entry.ts" --concurrency 2` | 379 mutants, 379 killed (100%)                                                                         |
| Backend suite | `cd backend && npx vitest run --testTimeout=60000`                                                                          | 22 files, 204 tests passed                                                                             |
| Docs gates    | translation check, anchor check, `mkdocs build --strict`                                                                    | 26 pages current; no dangling anchors; built                                                           |
| Real run      | `wrangler dev`, headless Chromium, synthetic account                                                                        | see below                                                                                              |

## Real execution

Local Worker (`wrangler dev --port 8819`), a synthetic account
(`@example.test`), the web app built from this tree. Save on a blank form:
"Type at least one shot before you save." Rounds Fired `2147483648`: "Rounds
Fired must be a whole number from 0 to 10000." A date in 1899: "The date
must be between 1900 and today." Decimal scoring with `9 10.4`: the row says
each shot needs its tenth. Nothing was sent in any of these. No console
errors. Screenshots in `/home/jimisola/tmp/qa/fix-shots/747/`, not in the
repo; the server was stopped afterwards.

## Layers not run as specified

- **N-A:** property-based tests: the new rules are three bounds, each pinned
  at and past its edge.
- **NOT RUN:** the phone's Rounds Fired screen on a device; it shares
  `parseRoundsFired` and only gained the `max` in its message.

## Honest notes

- E2's old test said "an entry with no rows at all is just a session"; #747
  asks for the opposite, so the test now pins the refusal.
- E15's example date (2026-10-09) lay two days past the test clock and so
  became out of range; it moved to 2026-10-06. What it checks did not change.
