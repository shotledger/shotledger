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

### Two conventions the tooling forces

Both are consequences of how reqstool matches a JUnit testcase to an
annotation, found by running it rather than by reading about it:

1. **A test tagged `@SVCs` is top-level and its title is a single identifier
   token** — `guld_threshold_per_marke_group_and_age_reduction`, not a prose
   sentence. The client takes the leading identifier of the testcase name, so a
   prose title matches only its first word, and a test nested in a `describe`
   matches the describe's name instead. The existing prose-titled suites are
   untouched; this applies only to the one test that carries the tag.
2. **The scan roots are three, and a stem is relative to its own root.** Two
   files at the same relative path under different roots would collide in one
   fully qualified name. Nothing collides today; it is a hazard to know about,
   not a problem to solve in advance.

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
- CI pins the client version. `reqstool status` was verified against 0.11.0 and
  0.12.2, which behave identically here.
- If reqstool is ever dropped, the cost is the annotations (harmless JSDoc), the
  dataset directory and two config blocks. Nothing else depends on it.
