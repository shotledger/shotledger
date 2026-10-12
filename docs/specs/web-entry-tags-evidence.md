# Evidence report — tags on a session entered on the web (Tier 3)

Spec: [`web-entry-tags-spec.md`](web-entry-tags-spec.md), with its §8
Revisions (R1, text only; R2, the maintainer's decision that tags ignore
case, 2026-10-12).

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; its key choices C1–C5 are listed in the PR for the
  maintainer. C3 has since been decided (R2); that answer is an input to the
  spec, not an approval of it. Confidence is downgraded accordingly: the spec
  is the artifact to review after the fact.
- **Source state:** commit `f00f2f1e` on `feat/web-entry-tags-690`, rebased
  onto `origin/main` at `f4e7ee18`. `pnpm check` ran on that state; the
  backend suite, Stryker and the browser check ran on `8b78781a`, one rebase
  earlier, whose source differs from `f00f2f1e` only by main's pnpm bump
  (#741) and a spec file (#710). This report is the only later change.
  (Round 1's numbers came from `51d8a29e` on `1487e954`, a state an earlier
  rebase replaced — the verifier's F6.)
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker, fast-check; backend vitest with `@cloudflare/vitest-plugin`).
- **Entry point:** `pnpm check`, then the backend suite and Stryker:

  ```bash
  cd backend && npx vitest run --testTimeout=60000
  pnpm exec stryker run --mutate "shared/src/tags/canonical.ts,shared/src/sync-client/tag-rows.ts,shared/src/sync-client/entry-tags.ts,shared/src/sync-client/bulk-edit.ts,web/src/entry/tags.ts,web/src/entry/kinds.ts" --concurrency 2
  ```

- **Independent verification: round 1 `failed` at `d0a296c6`** (report on
  the PR). F1 was settled by the maintainer as a decision (R2), so R2 is a
  code change that no verifier has seen: **the R2 state is unverified**; a
  round 2 in a fresh context is still owed. F2–F7 are fixed below.

## Failure model (Tier 3)

| Way this can hurt                                         | Layer that catches it                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| A link before its tag or session → the phone's FK refuses | N3 (APPLY_ORDER), A2 (the phone's real apply), W1            |
| A duplicate tag created for a name that has one           | N1, N10 (property), A3 (the phone's `getOrCreateTag` twin)   |
| A near-duplicate in another case or spacing (R2)          | N4, N10, K24, TN1–TN6 (TN6 a property), TP1, A3              |
| The phone and the web resolving a name differently (R2)   | one function (`findTag`); A3 runs both on one database       |
| Two links for one name                                    | N4, N10                                                      |
| A payload missing or adding a column → wedges the phone   | G1, G2, A1 (column parity with `app/src/db/schema.ts`)       |
| Retry builds fresh tag ids → a second tag row             | #669 U7 (held request resent unchanged), W2                  |
| The extracted builders change bulk edit's rows            | `bulk-edit.test.ts` K1–K17, K23 and `web-bulk.test.ts` P1–P5 |
| A tag deleted elsewhere between pull and push             | not caught — known limit (C5)                                |

## Spec → test mapping

| Scenario                       | Test                                                                              | Status |
| ------------------------------ | --------------------------------------------------------------------------------- | ------ |
| G1–G3                          | `shared/src/sync-client/tag-rows.test.ts`                                         | pass   |
| N1–N9                          | `shared/src/sync-client/entry-tags.test.ts` › N1…N9                               | pass   |
| N10 property (fast-check)      | `entry-tags.test.ts` › N10 (default 100 runs)                                     | pass   |
| K1–K17, K23 unchanged          | `shared/src/sync-client/bulk-edit.test.ts`, `app/src/db/queries/web-bulk.test.ts` | pass   |
| K24 (R2)                       | `bulk-edit.test.ts` › K24                                                         | pass   |
| TN1–TN6 (R2; TN6 fast-check)   | `shared/src/tags/canonical.test.ts`                                               | pass   |
| TP1–TP3 (R2)                   | `app/src/db/queries/tags.test.ts`                                                 | pass   |
| A1–A3                          | `app/src/db/queries/web-entry-tags.test.ts`                                       | pass   |
| W1–W2                          | `backend/test/web-entry-tags.spec.ts` (Workers pool, real D1 + better-auth)       | pass   |
| TU1–TU7                        | `web/src/entry/tags.test.ts`                                                      | pass   |
| TU8 (R2)                       | `web/src/entry/kinds.test.ts` › TU8                                               | pass   |
| M1 one push                    | N3, TU8 (`buildEntry`'s composition), TU6, W1                                     | pass   |
| M2 only the new tags and links | N1, N2, N10                                                                       | pass   |
| M3 no tag for a live name      | N1, A3                                                                            | pass   |
| M4 no null / unknown column    | G1, G2, A1                                                                        | pass   |
| M5 bulk edit unchanged         | K1–K17, K23, P1–P5 unchanged; Add Tag's case rule is R2 (K24)                     | pass   |
| M6 no browser storage          | `web/src/entry/save.test.ts` › N1 grep gate (scans `tags.ts`, `tags-field.tsx`)   | pass   |
| M7 no dependency, no protocol  | diff: no `package.json`, lockfile or `shared/src/sync/` change                    | pass   |

## Gauntlet (final run)

| Layer                    | Command                                                  | Result                                                                                       |
| ------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tests, types, lint, i18n | `pnpm check` (on `f00f2f1e`)                             | exit 0; vitest 201 files, 3274 tests passed; jest 66 suites, 726 tests passed                |
| Coverage                 | `vitest run --coverage` inside `pnpm check`              | 100% statements (4045), branches (2589), functions (970), lines (3425) on the `mutate` globs |
| Backend                  | `cd backend && npx vitest run --testTimeout=60000`       | 22 files, 204 tests passed                                                                   |
| Mutation                 | Stryker, the six modules above                           | 497 mutants: 493 killed, 4 survived, 0 timeout, 0 no coverage (99.20%)                       |
| Property-based           | N10, TN6                                                 | 2 properties, fast-check default 100 runs                                                    |
| Docs                     | translation check, anchor check, `mkdocs build --strict` | 26 translated pages current; no dangling anchors; strict build passes                        |
| Real execution           | browser against `wrangler dev` (below)                   | saved; server rows as expected; no console errors                                            |
| Supply chain             | —                                                        | no dependency added or removed                                                               |

Per module (killed / mutants), from Stryker's clear-text table:
`canonical.ts` 75/77, `tag-rows.ts` 11/11, `entry-tags.ts` 61/61,
`bulk-edit.ts` 243/244, `web/src/entry/tags.ts` 34/34, `kinds.ts` 67/68 —
493 of 497. `save.ts` and `model.ts` were not in this run: R2 does not touch
them. (Round 1's per-module figures summed to 660 against a stated 665, F7.)

### Survivors

None is on a line this branch changed; each was checked for divergence.

- `canonical.ts:24` `a < b` → `a <= b` in `byBinary`: **equivalent**; it is
  only ever given distinct names.
- `canonical.ts:32` `tag.id < current` → `<=`: **equivalent**; on equal ids
  both keep the same id.
- `bulk-edit.ts:195` `firearmId !== null && …` → `true && …`: equivalent,
  `isLive(context.firearms.get(null))` is false.
- `kinds.ts:55` `form.programId === null` → `false`: equivalent,
  `getProgram(null)` is undefined (#718's code).

### Throwaway mutants (RED for tests that passed at once)

- U6 passed at runtime before `SaveDeps` was made generic (the change is to
  types). Mutant `deps.build({ ...context })` in `save.ts`: U6 failed;
  restored.
- A1–A3 were written after the builders. Mutant: `canonicalTagId` takes the
  largest id. A3 failed; restored (`git restore`).

## Real execution

**R2 (state `8b78781a`).** Local Worker (`wrangler dev --port 8816`, local
D1/R2, the web app built from this tree), one synthetic account
(`@example.test`) seeded with the tags `Season 2026`, `Club Match` and a
Unicode name. Headless Chromium: on Enter Series typed `club match` + Enter,
` new   tag` + Add, `NEW TAG` + Enter, `season 2026` + Enter; the chosen
list read `Club Match`, `new tag`, `Season 2026` (`NEW TAG` was the chosen
`new tag`), and the suggestions offered only the Unicode tag. Saved. A pull
showed four `tags` rows (one new: `new tag`) and the session linked to
`Club Match`, `new tag` and `Season 2026`. On Bulk Edit, Add Tag
` CLUB   match` on eleven sessions pushed only `session_tags` rows (8
changed, 3 already tagged), no `tags` row. No console errors. Screenshots in
`/home/jimisola/tmp/qa/fix-shots/690/`, not in the repo. The server was
stopped afterwards.

**Round 1 (state `51d8a29e`).** Local Worker (`wrangler dev --port 8790`, local D1), one synthetic account
(`@example.invalid`) seeded with a tag `KM` through `/sync/push`. In Chrome:
typed `10 9 X 10 9`, typed `KM` in Tags and pressed Enter (the tag was added
and nothing was saved), typed `Club` and clicked Add, then Save → "Saved.";
the Sessions page lists the session with Club and KM. A pull from the server
showed two `tags` rows (the seeded KM, unchanged, and one new Club) and two
`session_tags` rows: one to the seeded KM, one to Club. No console errors on
reload. Screenshots are kept locally in
`/home/jimisola/tmp/feat-web-entry-tags-690-shots/`, not in the repo. The
server was stopped afterwards.

## Layers not run as specified

- **SUBSTITUTED:** independent verification — not performed (declared
  downgrade above); the adversarial pass was this author's own (below).
- **N-A:** none beyond that.

## Adversarial pass (own)

Tried: a name that is only blanks (dropped, N7); the same name padded and
unpadded (one link, N4); `KM` against `km` (round 1: two tags, which the
verifier's F1 showed was true only of the phone's edit screen; R2: one tag,
N4, TP1, K24); two live tags differing only in case (the exact spelling
wins, TN5, TP3); a deleted case-variant copy (skipped, TN4, TP2);
121 characters after trimming (refused, N5); a failed entry with an invalid
tag (the entry's own errors win and no id is drawn, N6); exactly
`PUSH_BATCH_MAX` and one over (N9); two live KM copies (the smaller id wins,
G3, A3); a deleted KM copy (skipped, G3).

## Structural blind spot

- The page component (`tags-field.tsx`, `entry.tsx`) has no automated test,
  as for the rest of `web/src` pages; its wiring was checked in the browser.
  The build's composition is now in `buildEntry` and pinned by TU8 (F2);
  what stays untested is `entry.tsx` calling `buildEntry`, `addTag`'s third
  argument, and the Enter / Ctrl+Enter key handling in `tags-field.tsx`.
- The phone's `TagSelect` and session edit screen are not under a render
  test (the repo has none for components); they call the shared rule, which
  TN1–TN6 and TP1–TP3 pin. Not checked on a device in this run.
- Readers still keep two live tags that differ only in case apart (§3.0 of
  the spec); only data made before R2, or by an older build, has them.
- A tag deleted on another device between the fresh pull and the push is not
  detected (C5).

## Honest notes

- Two app-test assertions (A2, A3) first assumed `listTagsForSession`
  returns names sorted; it returns them in link order. The assertions were
  corrected before the code was green; no code changed.
- Prettier broke inline code spans that wrapped lines in the spec; reworded
  (R1, text only).
- A `git checkout` used to undo a throwaway mutant also dropped the
  uncommitted change it sat on; that change was put back from a backup made
  just before, and the suite rerun.
