# Requirement traceability (reqstool)

`shared/src/scoring`, `shared/src/compliance` and `shared/src/disciplines`
implement rules from public rule books, and the maintainer does not read that
code line by line. Coverage and mutation testing prove every line is exercised;
they cannot say "SHB F.2.8's rule is implemented here, and this test verifies
it". reqstool does: requirements and verification cases as data, tags in the
source, JUnit results from the real run, and a status command with an exit code.
(The maintainer authors reqstool; using it here is dogfooding.)

## How it runs

- `@reqstool/reqstool-typescript-tags` scans `shared/src`, `backend/src` and
  `app/src` for JSDoc `@Requirements` and `@SVCs` and writes
  `build/reqstool/annotations.yml`.
- This directory holds the dataset: `requirements.yml`,
  `software_verification_cases.yml`, `reqstool_config.yml`.
- Both test runners write JUnit into `build/test-results/` (vitest's reporter,
  `jest-junit` for `app/`), naming test cases through `reqstoolStem` in
  `scripts/reqstool-stem.js` so the two agree.
- CI runs `pnpm reqstool:tags`, then `pnpm reqstool:status` with
  `--check-all-reqs-met`: a requirement with no implementation, or whose test
  did not pass, fails the build. It stays out of `pnpm check` because it needs
  the Python client (`pipx install reqstool`). Run `pnpm check` first;
  `pnpm mutation` overwrites the vitest JUnit file.

## Tagging rules

- A test tagged `@SVCs` must be **top-level**, not inside a `describe`: the
  scanner records a nested `it` as `<describe>_<it>`, the reporters only the
  leaf. It fails loudly (`automated test missing`).
- Several ids on one tag are **comma**-separated; space-separated becomes one
  malformed id.
- A tagged test's title must not begin with a digit: the client skips the test,
  so status reports the requirement's test as missing.
- A stem is relative to its scan root, so the same relative path under two roots
  would collide. Nothing collides today.
- A mapping problem is fixed in the runner configuration, not in the tests.

## What goes where

| Document                            | Answers                                  |
| ----------------------------------- | ---------------------------------------- |
| `docs/reference/`                   | what the rule book says, with a citation |
| `docs/reqstool/requirements.yml`    | what the app must do, verifiably         |
| `ARCHITECTURE.md`, `REGULATIONS.md` | why we chose this over that              |
| `docs/specs/` (evidence-first)      | how a module behaves, case by case       |
| `docs/implementation-plan.md`       | what to build next                       |
| `docs/manual/`                      | what the user is told                    |

- A requirement earns its place when getting it wrong would mislead a shooter
  about a score, a license renewal or their own data. Not one per function, and
  not one per spec behavior.
- A requirement cites `docs/reference/`; it does not restate the source.
- A requirement is added in the same branch as the change that implements it.

If reqstool is ever dropped, the cost is the annotations (harmless JSDoc), this
directory and two config blocks.
