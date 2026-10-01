# ADR 0015: reqstool for requirement↔test traceability

Status: accepted (2026-09-21)

## Context

`shared/src/scoring`, `shared/src/compliance` and `shared/src/disciplines`
implement rules from public rule books — SHB 2026, ISSF, FAP 551-3 — and the
maintainer does not read that code line by line. The assurance story so far is
the old-coder loop: an approved spec, 100% coverage thresholds, and mutation
testing (`pnpm gauntlet`).

That gauntlet proves every _line_ is exercised and every mutant dies. It cannot
say **"SHB F.2.8's rule is implemented here, and that test is what verifies
it."** The link from a named rule to the test that holds it up exists only as
prose in a spec file, where nothing checks it and nothing notices when it rots.

reqstool closes exactly that gap: requirements and software verification cases
as data, annotations in the source, JUnit results from the real test run, and a
status command with an exit code.

**Disclosure: the maintainer authors reqstool.** Adopting it here is
dogfooding, and that is a legitimate reason — but this ADR states it rather
than presenting a neutral bake-off it was not.

## Decision

**Adopt reqstool across the whole repo** (maintainer ruling, 2026-09-21).

- `@reqstool/reqstool-typescript-tags` (dev dependency, repo root) scans
  `shared/src`, `backend/src` and `app/src` for JSDoc `@Requirements` and
  `@SVCs` tags and writes `build/reqstool/annotations.yml`.
- The dataset lives in `docs/reqstool/`: `requirements.yml`,
  `software_verification_cases.yml`, `reqstool_config.yml`.
- Both test runners emit JUnit into `build/test-results/`. vitest gets the
  reporter and a `classnameTemplate`; `app/`'s jest gets `jest-junit` with a
  `classNameTemplate`. Both call `reqstoolStem` in `scripts/reqstool-stem.js`,
  which is why the two agree.
- `pnpm reqstool:tags` then `pnpm reqstool:status` gates CI, with
  `--check-all-reqs-met`: a requirement with no implementation, or one whose
  verifying test did not pass, fails the build.

Like the docs gates, it stays out of `pnpm check`: it needs the Python client
(`pipx install reqstool`), which a code-only contributor has no reason to
install.

### Tagging rules

The fix for a test-result mapping problem belongs in the runner
configuration, not in the tests. Both reporters pass the testcase name through
`reqstoolTestName`, which applies the scanner's own sanitisation, so tagged
tests keep ordinary prose titles. What the configuration cannot fix:

- **A test tagged `@SVCs` must be top-level**, not nested in a `describe`: the
  scanner records a nested `it` as `<describe>_<it>`, the reporters emit only
  the leaf. It fails loudly (`automated test missing`), not silently.
- **Multiple ids on one tag are comma-separated** (`@Requirements A, B`);
  space-separated silently becomes one malformed id.
- **A tagged test's title must not begin with a digit**; the client skips it.
- **A stem is relative to its scan root** (`shared/src`, `backend/src`,
  `app/src`), so the same relative path under two roots would collide.
  Nothing collides today.

## What goes in requirements.yml, and what does not

This is the part worth getting right, because reqstool is the **fifth** place
in this repo that could be read as saying what the app must do. The division:

| Document                         | Answers                                                 | Lifetime                     |
| -------------------------------- | ------------------------------------------------------- | ---------------------------- |
| `docs/reference/`                | "what does the rule book actually say", with a citation | as long as the edition       |
| `docs/reqstool/requirements.yml` | "what must this app do, verifiably"                     | until the rule changes       |
| `docs/adr/`                      | "why did we choose this over that"                      | until superseded (see below) |
| `docs/specs/` (old-coder)        | "how does this module behave, case by case"             | with the module              |
| `docs/implementation-plan.md`    | "what do we build next"                                 | until the checkbox is ticked |
| `docs/manual/`                   | "what is the user told"                                 | with the feature             |

Rules that follow, so these do not grow into copies of each other:

- **A requirement earns its place when getting it wrong would mislead a shooter
  about a score, a märke, a licence renewal or their own data.** Not one per
  function, and not one per spec behaviour — `docs/specs/` already enumerates
  behaviours B1…B12 at a finer grain, and duplicating them here would be two
  lists to keep in step.
- **The rule book still wins.** A requirement cites `docs/reference/`; it does
  not restate the source. The reference file, in turn, cites the book.
- **An ADR is a decision, not a requirement.** A requirement's `rationale` may
  cite an ADR; an ADR does not carry requirement ids, because it would go stale
  the first time one is renumbered.
- **A requirement is added in the same branch as the change that implements
  it** — the same rule the manual already lives under (Definition of done). Not
  a backlog to populate later.
- **Before 1.0, an ADR is edited in place, or deleted when superseded.** The
  replacement says "Supersedes ADR NNNN"; git keeps the old text. Numbers are
  never reused.

## Consequences

- `build/` is gitignored, so annotations and JUnit results stay out of the
  tree.
- The corpus grows per change; the machinery covers the whole repo.
- `pnpm mutation` may overwrite `build/test-results/junit-vitest.xml` with a
  mutant run's results, so run `pnpm check` before `reqstool:status`. CI goes
  `check` → `status` directly.
- If reqstool is ever dropped, the cost is the annotations (harmless JSDoc), the
  dataset directory and two config blocks. Nothing else depends on it.
