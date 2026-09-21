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

### Not in `pnpm check`

`reqstool status` needs the Python client (`pipx install reqstool`), so it
stays out of `pnpm check` for the same reason the three docs gates do — a
code-only contributor has no reason to install a Python toolchain. CI runs it;
`pnpm check` does not. That now makes **four** gates outside `check`.

### What the tooling forces, and what it does not

reqstool's build-config conventions say the fix for a test-result mapping
problem belongs in the **runner configuration**, not in the tests — their
worked example is Gradle's parameterized display names. The same applies here,
and it is why the tests keep ordinary prose titles:

- Both reporters pass the testcase name through `reqstoolTestName`, which
  applies the scanner's own sanitisation (`[^a-zA-Z0-9]+` → `_`). So
  `it('excludes a sighter from the scored result …')` reaches the JUnit file as
  `excludes_a_sighter_from_the_scored_result_…` and matches the annotation the
  scanner recorded for that same test. No test was renamed to suit the tool.

Two constraints remain, and both are real:

1. **A test tagged `@SVCs` must be top-level**, not nested in a `describe`. The
   scanner records a nested `it` as `<describe>_<it>` while both reporters emit
   the leaf title alone, and with describes nested deeper there is no template
   that can agree. There is no template fix for this one, so it stays a rule.
   **It fails loudly, not silently** — `automated test missing`, and CI exits
   non-zero. The existing prose-titled, deeply-nested suites are untouched;
   this applies only to the one test carrying the tag.
2. **The scan roots are three, and a stem is relative to its own root.** Two
   files at the same relative path under different roots would collide in one
   fully qualified name. Nothing collides today; it is a hazard to know about,
   not a problem to solve in advance.

Two smaller sharp edges, recorded so they are not rediscovered:

- **Multiple ids on one tag are comma-separated** (`@Requirements A, B`).
  Space-separated silently becomes one malformed id.
- **A title beginning with a digit cannot be matched.** The client's name regex
  requires an identifier start, so `it('10 and X differ …')` is skipped with a
  warning. Harmless on an untagged test; on a tagged one, start the title with
  a letter.

## What goes in requirements.yml, and what does not

This is the part worth getting right, because reqstool is the **fifth** place
in this repo that could be read as saying what the app must do. The division:

| Document                         | Answers                                                 | Lifetime                         |
| -------------------------------- | ------------------------------------------------------- | -------------------------------- |
| `docs/reference/`                | "what does the rule book actually say", with a citation | as long as the edition           |
| `docs/reqstool/requirements.yml` | "what must this app do, verifiably"                     | until the rule changes           |
| `docs/adr/`                      | "why did we choose this over that"                      | permanent, superseded not edited |
| `docs/specs/` (old-coder)        | "how does this module behave, case by case"             | with the module                  |
| `docs/implementation-plan.md`    | "what do we build next"                                 | until the checkbox is ticked     |
| `docs/manual/`                   | "what is the user told"                                 | with the feature                 |

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

## Consequences

- Two new dev dependencies, both registered in ADR 0009:
  `@reqstool/reqstool-typescript-tags` (MIT) and `jest-junit` (Apache-2.0).
  Neither ships in the APK, so `app/src/constants/licenses.json` is unchanged —
  the generator derives that from Metro's module graph.
- `build/` is already gitignored, so annotations and JUnit results stay out of
  the tree.
- The corpus starts at ten requirements spanning scoring, compliance,
  disciplines, the shot timer, the backend and the app. That is a floor, not a
  target: the machinery covers the whole repo from day one and the corpus grows
  per change.
- CI pins the client version and installs it with
  `pipx install --python "$pythonLocation/bin/python"`. That flag is
  load-bearing: pipx builds its venv with the interpreter _pipx_ was installed
  with (system 3.12 on `ubuntu-latest`), not the one `setup-python` puts on
  PATH, and reqstool is `Requires-Python >=3.13`. Without it the step fails
  with "No matching distribution found" and the gate never runs.
- `reqstool status` was verified against 0.11.x and the pinned 0.12.2, which
  behave identically here — including the failure cases: an unimplemented
  requirement, a **failing** tagged test, and a skipped one all exit non-zero.
- `pnpm mutation` may overwrite `build/test-results/junit-vitest.xml` with a
  mutant run's results, so run `pnpm check` before `reqstool:status` rather
  than trusting whatever is on disk. CI goes `check` → `status` directly.
- If reqstool is ever dropped, the cost is the annotations (harmless JSDoc), the
  dataset directory and two config blocks. Nothing else depends on it.
