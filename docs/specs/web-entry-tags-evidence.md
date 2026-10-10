# Evidence report — tags on a session entered on the web (Tier 3)

Spec: [`web-entry-tags-spec.md`](web-entry-tags-spec.md), with its §8
Revisions (R1, text only).

- **Spec approval: not obtained (autonomous run).** The spec was written and
  built in one run; its key choices C1–C5 are listed in the PR for the
  maintainer. Confidence is downgraded accordingly: the spec is the artifact
  to review after the fact.
- **Source state:** commit `51d8a29e` on `feat/web-entry-tags-690`, from
  `origin/main` at `1487e954`. Every number below is from that state; this
  report is the only later change.
- **Toolchain:** pinned in `package.json` / `pnpm-lock.yaml` (vitest 5.0.3,
  Stryker, fast-check; backend vitest with `@cloudflare/vitest-plugin`).
- **Entry point:** `pnpm check`, then the backend suite and Stryker:

  ```bash
  cd backend && npx vitest run --testTimeout=60000
  pnpm exec stryker run --mutate "shared/src/sync-client/tag-rows.ts,shared/src/sync-client/entry-tags.ts,shared/src/sync-client/bulk-edit.ts,web/src/entry/tags.ts,web/src/entry/save.ts,web/src/entry/model.ts"
  ```

- **Independent verification: not performed.** A declared downgrade: no
  fresh-context verifier saw any state of this change.

## Failure model (Tier 3)

| Way this can hurt                                         | Layer that catches it                                      |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| A link before its tag or session → the phone's FK refuses | N3 (APPLY_ORDER), A2 (the phone's real apply), W1          |
| A duplicate tag created for a name that has one           | N1, N10 (property), A3 (the phone's `getOrCreateTag` twin) |
| Two links for one name                                    | N4, N10                                                    |
| A payload missing or adding a column → wedges the phone   | G1, G2, A1 (column parity with `app/src/db/schema.ts`)     |
| Retry builds fresh tag ids → a second tag row             | #669 U7 (held request resent unchanged), W2                |
| The extracted builders change bulk edit's rows            | `bulk-edit.test.ts` K1–K23 and `web-bulk.test.ts` P1–P5    |
| A tag deleted elsewhere between pull and push             | not caught — known limit (C5)                              |

## Spec → test mapping

| Scenario                       | Test                                                                              | Status |
| ------------------------------ | --------------------------------------------------------------------------------- | ------ |
| G1–G3                          | `shared/src/sync-client/tag-rows.test.ts`                                         | pass   |
| N1–N9                          | `shared/src/sync-client/entry-tags.test.ts` › N1…N9                               | pass   |
| N10 property (fast-check)      | `entry-tags.test.ts` › N10 (default 100 runs)                                     | pass   |
| K1–K23 unchanged               | `shared/src/sync-client/bulk-edit.test.ts`, `app/src/db/queries/web-bulk.test.ts` | pass   |
| A1–A3                          | `app/src/db/queries/web-entry-tags.test.ts`                                       | pass   |
| W1–W2                          | `backend/test/web-entry-tags.spec.ts` (Workers pool, real D1 + better-auth)       | pass   |
| U1–U6                          | `web/src/entry/tags.test.ts`                                                      | pass   |
| M1 one push                    | N3, U6, W1                                                                        | pass   |
| M2 only the new tags and links | N1, N2, N10                                                                       | pass   |
| M3 no tag for a live name      | N1, A3                                                                            | pass   |
| M4 no null / unknown column    | G1, G2, A1                                                                        | pass   |
| M5 bulk edit unchanged         | K1–K23, P1–P5 (test files untouched by this diff)                                 | pass   |
| M6 no browser storage          | `web/src/entry/save.test.ts` › N1 grep gate (scans `tags.ts`, `tags-field.tsx`)   | pass   |
| M7 no dependency, no protocol  | diff: no `package.json`, lockfile or `shared/src/sync/` change                    | pass   |

## Gauntlet (final run, state `51d8a29e`)

| Layer                    | Command                                                  | Result                                                                                                                               |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tests, types, lint, i18n | `pnpm check`                                             | exit 0; vitest 197 files, 3202 tests passed; jest 62 suites, 708 tests passed                                                        |
| Coverage                 | `vitest run --coverage` inside `pnpm check`              | 100% threshold on the `mutate` globs met (exit 0); the new modules fall under `shared/src/sync-client/*.ts` and `web/src/entry/*.ts` |
| Backend                  | `cd backend && npx vitest run --testTimeout=60000`       | 21 files, 202 tests passed                                                                                                           |
| Mutation                 | Stryker, the six modules above                           | 672 mutants: 665 killed, 1 timeout, 6 survived, 0 no coverage (99.11%)                                                               |
| Property-based           | N10                                                      | 1 property, fast-check default 100 runs                                                                                              |
| Docs                     | translation check, anchor check, `mkdocs build --strict` | 26 translated pages current; no dangling anchors; strict build passes                                                                |
| Real execution           | browser against `wrangler dev` (below)                   | saved; server rows as expected; no console errors                                                                                    |
| Supply chain             | —                                                        | no dependency added or removed                                                                                                       |

Per module: `entry-tags.ts` 57/57, `tags.ts` 29/29, `save.ts` 97/97 killed;
`tag-rows.ts` 25/26; `bulk-edit.ts` 246/247 (plus the timeout); `model.ts`
206/210.

### Survivors

- `tag-rows.ts:33` `id < canonical` → `id <= canonical`: **equivalent**. The
  two differ only when `id === canonical`, where both keep the same id.
- `bulk-edit.ts:191` `firearmId !== null && …` → `true && …`: on a line this
  diff does not touch. Equivalent: `isLive(context.firearms.get(null))` is
  false.
- `model.ts:67` (`lastKey += 1` → `-= 1`), `model.ts:136` and two regex
  anchors at `model.ts:251`: on lines this diff does not touch (#669's code);
  out of scope here and left as they are.

### Throwaway mutants (RED for tests that passed at once)

- U6 passed at runtime before `SaveDeps` was made generic (the change is to
  types). Mutant `deps.build({ ...context })` in `save.ts`: U6 failed;
  restored.
- A1–A3 were written after the builders. Mutant: `canonicalTagId` takes the
  largest id. A3 failed; restored (`git restore`).

## Real execution

Local Worker (`wrangler dev --port 8790`, local D1), one synthetic account
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
unpadded (one link, N4); `KM` against `km` (two tags, as on the phone, N4);
121 characters after trimming (refused, N5); a failed entry with an invalid
tag (the entry's own errors win and no id is drawn, N6); exactly
`PUSH_BATCH_MAX` and one over (N9); two live KM copies (the smaller id wins,
G3, A3); a deleted KM copy (skipped, G3).

## Structural blind spot

- The page component (`tags-field.tsx`, `entry.tsx`) has no automated test,
  as for the rest of `web/src` pages; its wiring was checked once in the
  browser.
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
