# Contributing to ShotLedger

Thanks for helping. This file is for developers: how the repository is laid
out, how to build and check it, and the terms your contribution arrives under.
What the app does is in the [`README`](README.md).

The working rules — branch per change, Conventional Commits, the checks CI
runs — are in [`CLAUDE.md`](CLAUDE.md) and the `CLAUDE.md` files in each
folder, and apply to human contributors just as much. Running the app is in
[`.claude/skills/run-app/`](.claude/skills/run-app/SKILL.md).

## Development

### Where things are

| Path                              | What it is                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/`](app/README.md)           | The React Native + Expo app: screens, local SQLite database, i18n, platform wrappers. `app/PRODUCT.md` says what the product is and why.                                         |
| [`shared/`](shared/README.md)     | Pure TypeScript with no React Native imports: scoring, disciplines and regulations, compliance, exports, sync protocol. Used by the app and the backend.                         |
| [`backend/`](backend/README.md)   | Optional Cloudflare Worker for account, sync and photo backup. Never deployed from this repo by an agent.                                                                        |
| `web/`                            | The web app (Vite + React), served by the Worker: reads synced data and writes only through sync push, on par with the phone. `web/CLAUDE.md` has the rules.                     |
| `docs/`                           | Architecture, ADRs, the implementation plan, verified rule-book references, evidence-first specs, release checklist, and the user manual.                                        |
| `docs/manual/`                    | The **user** manual (EN + SV), published with MkDocs from `mkdocs.yml`. Gated by `mkdocs build --strict` and the translation-freshness script.                                   |
| `scripts/`                        | Repo gates and generators run by `pnpm check` and by hand — see below.                                                                                                           |
| `patches/`                        | pnpm patches for two dependencies, each with its reason in `pnpm-workspace.yaml`.                                                                                                |
| [`tools/cv/`](tools/cv/README.md) | TypeScript tools that run the app's photo-scoring CV on real photos kept outside the repo, label holes, fit the hole models and write the CV fixtures. Not part of `pnpm check`. |
| `stryker.config.json`             | Mutation-testing configuration for the evidence-first modules.                                                                                                                   |

### Getting started

Requires Node 24, the current LTS (exact version in `.node-version`, which
`fnm`, `mise`, CI and the cloud-session hook in `.claude/hooks/` read) and
pnpm 12 (pinned in `package.json`).

```bash
pnpm i
pnpm approve-builds esbuild workerd   # once per machine: native build scripts pnpm blocks by default
pnpm check                            # every gate CI runs
cd app && pnpm exec expo start        # Metro, for a dev build or the web preview
```

Android toolchain, emulator, Maestro flows and standalone builds are
described step by step in `.claude/skills/run-app/`; the backend's
in-process test harness in `backend/CLAUDE.md`. The sync backend's layout
is in `docs/sync-backend.md`.

### Checks

`pnpm check` is what CI runs: the Node version gate, TypeScript for every
package (web included), the export-schema gate, the i18n key gate, the
license-list gate, ESLint, Prettier, Vitest and the app's Jest suite. The
three documentation gates are separate because the build needs Python:
`mkdocs build --strict`, `pnpm docs:translations` and `pnpm docs:anchors`
(see `docs/CLAUDE.md`).

The modules the maintainer does not read line by line — scoring,
compliance, CSV, sync — are developed evidence-first (see
`.claude/skills/old-coder/`): each has a spec and an evidence report under
`docs/specs/`, 100% coverage enforced by `pnpm coverage`, and a mutation
gate. `pnpm gauntlet` runs every layer.

Everything else carries a coverage floor rather than a target: the total
coverage when the floor was set, rounded down (`COVERAGE_FLOOR` in
`vitest.config.ts`, `coverageThreshold` in `app/jest.config.js`). When a
change raises coverage, raise the floor in the same PR; never lower it to
get a change through.

Vitest runs with `isolate: false`: test files in one worker share module
state, so a test that changes a module, a global or the clock puts it back
in `afterEach`. Tests do not wait on real time: ESLint rejects a
`setTimeout`/`setInterval` with a delay in a test file; use fake timers
(`vi.advanceTimersByTimeAsync`, `jest.advanceTimersByTime`) or
`vi.setSystemTime`. `pnpm exec vitest run --sequence.shuffle` checks for
order dependence.

There are two test runners because each runs code the other cannot. Jest
(`jest-expo`) runs `app/src`: React Native components and hooks need
Metro's Babel transforms and Expo's native-module mocks, and `jest-expo` is
the preset Expo supports. Vitest runs the plain TypeScript (`shared/`,
`backend/`, `web/`, `app/src/db`): it is faster, the backend's Workers
tests need its `workerd` pool, and the Stryker mutation gate uses its
runner.

The Maestro flows in `app/e2e/` run on an Android emulator in the E2E
workflow (`.github/workflows/e2e.yml`), on pushes to `main` that touch the
app and on pull requests labelled `e2e`. Add the label when a change alters
a flow's screens; it costs far more Actions minutes than `check`.

#### `scripts/`

| Script                                              | Run by                                         | What it guards                                                                                          |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `node-version-check.mjs`                            | `pnpm check`                                   | `engines.node` and the EAS `base` profile match `.node-version`, the one source for the Node version.   |
| `i18n-check.mjs`                                    | `pnpm check`                                   | `en.json` and `sv.json` have identical keys, and every key is referenced from `app/src`.                |
| `generate-licenses.mjs`                             | `pnpm check` (check), `pnpm licenses:generate` | The About screen's open-source list matches what Metro actually bundles.                                |
| `generate-export-schema.mjs`                        | `pnpm check` (check), `pnpm schema:generate`   | The published JSON Schema for session exports is derived from the zod schema the app validates against. |
| `ensure-expo-env.mjs`                               | `pnpm typecheck:app`                           | Writes the gitignored `expo-env.d.ts` on a clean checkout so the app typechecks in CI.                  |
| `docs-translation-check.mjs`                        | CI docs job                                    | A `.sv.md` manual page whose last commit is older than its English source fails the build.              |
| `docs-anchor-check.mjs`                             | CI docs job                                    | A manual link pointing at a heading that no longer exists — which `mkdocs build --strict` lets pass.    |
| `mutate-schema.mjs`, `mutate-webshooter-schema.mjs` | `pnpm gauntlet`                                | On-disk mutation of zod schemas, which Stryker cannot mutate because they run at module load.           |
| `manual-mutation.mjs`                               | by hand                                        | Manual mutants for `shared/src/json-export`, recorded in its evidence report.                           |
| `manual-mutation-sync-push.mjs`                     | by hand                                        | Manual mutants for the sync push batch in `backend/src/db/queries.ts`, which Stryker cannot reach.      |
| `manual-mutation-backup-sync.mjs`                   | by hand                                        | Manual mutants for the sync-bookkeeping reset a backup and a restore run (`app/src/db`).                |
| `manual-mutation-sync-tags-settings.mjs`            | by hand                                        | Manual mutants for synced tags and settings outside Stryker's reach (app queries, web, Worker route).   |
| `manual-mutation-web-edit.mjs`                      | by hand                                        | Manual mutants for the web session edit, including its phone twin tests.                                |
| `manual-mutation-web-bulk.mjs`                      | by hand                                        | Manual mutants for the web bulk edit, including its phone twin tests.                                   |
| `mutate-volume.mjs`                                 | by hand                                        | Manual mutants for the app side of the one volume rule, which is outside Stryker's scope.               |
| `build-eval.mjs`                                    | `pnpm build:eval`, by the maintainer           | Builds a 30-day evaluation APK; see `docs/release.md`.                                                  |
| `reqstool-stem.js`                                  | the test runners                               | The test-name prefix reqstool matches JUnit results against (ADR 0015).                                 |
| `i18n-check-negative-control.mjs`                   | by hand                                        | Proves the i18n gate can still fail (mutates the JSON, expects a nonzero exit, restores it).            |

#### Mutation testing

[Stryker](https://stryker-mutator.io/) changes the source in small ways —
flips a `<` to `<=`, deletes a branch, replaces a constant — and runs the
tests against each mutant. A mutant the tests still pass on "survived",
which means a bug of that shape would ship unnoticed. The score is the
share of mutants killed; `stryker.config.json` breaks the build below 95%
and lists exactly which modules are mutated. Run `pnpm mutation`. It is
slow, so it is part of `pnpm gauntlet`, not of `pnpm check`.

#### CI runners

Every workflow job except the Android emulator run (`e2e.yml`, which
needs KVM and stays on GitHub's `ubuntu-latest`) takes its runner from the
`CI_RUNNER` repository variable (Settings → Secrets and variables → Actions → Variables):

| `CI_RUNNER`                    | Jobs run on                                       |
| ------------------------------ | ------------------------------------------------- |
| unset                          | GitHub-hosted `ubuntu-latest`                     |
| `blacksmith-2vcpu-ubuntu-2404` | [Blacksmith](https://docs.blacksmith.sh/), 2 vCPU |

Switching is a settings change, not a commit, and applies from the next
queued job. Use whichever side still has free minutes for the month:
Blacksmith gives 3,000 2-vCPU minutes per organization, GitHub's allowance
depends on the plan. Nothing switches automatically: a runner is picked
when a job is queued, and neither side reports "minutes used up" to a
workflow. Stay on the 2-vCPU size; larger Blacksmith runners use the free
minutes faster in proportion to their vCPUs. Blacksmith needs its GitHub
App installed on the organization and only serves organization-owned
repositories. Both runners restore caches through `actions/cache`, so
the first run after a switch starts with a cold cache.

### Working in this repo

- Branch per change, Conventional Commits, every commit DCO-signed
  (`git commit -s`). Never commit to `main`; a merge needs the
  maintainer's OK.
- Secrets never enter the working tree. Real personal data never does
  either, in any form: fixtures are synthetic.
- Regulatory values (scoring thresholds, class ages, activity counts) are
  read from the rule books cited in `docs/reference/` and never guessed.
- A change that alters what a user sees updates `docs/manual/` in the same
  pull request.

`CLAUDE.md` (with the `CLAUDE.md` in `app/`, `shared/`, `backend/` and
`docs/`) is the full set of rules; it applies to human contributors just as
much.

### Reading order

1. [`app/PRODUCT.md`](app/PRODUCT.md) — what and why.
2. [`docs/architecture.md`](docs/architecture.md) — the tech choices and
   the iOS-readiness rules.
3. [`docs/adr/`](docs/adr/) — the decisions behind them.
4. [`docs/implementation-plan.md`](docs/implementation-plan.md) — the
   execution spec, milestone by milestone.
5. [Open issues](https://github.com/shotledger/shotledger/issues) — what is
   outstanding.

## Contribution terms

Nothing in this file is legal advice.

### Which license your contribution is under

The repository holds works under more than one license; the root
[`LICENSE`](LICENSE) is the map and `REUSE.toml` is the per-file source of
truth. A contribution is licensed under the terms of the directory it lands in:

| Directory                          | Inbound terms                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/`                         | Elastic License 2.0 (`LICENSES/Elastic-2.0.txt`)                                                                                                                     |
| `shared/src/sync/`                 | Apache-2.0 (`LICENSES/Apache-2.0.txt`) — the sync protocol the backend compiles in; it may import only `zod` and its own files                                       |
| `app/`, `shared/`, everything else | AGPL-3.0-or-later (`LICENSES/AGPL-3.0-or-later.txt`) **together with** the section 7 additional permissions in `LICENSES/LicenseRef-ShotLedger-AGPL-Permissions.txt` |

"Together with" matters: a contribution to `app/` or `shared/` carries the
same app-store and platform-library permissions as the rest of the code, so
the project can keep shipping through the stores and keep linking Google ML
Kit without asking every contributor again.

Third-party code keeps its own license and is listed in
`app/src/constants/licenses.json` (bundled JavaScript) or
`app/src/constants/native-licenses.ts` (native artifacts). Adding a dependency
is a maintainer decision — see hard rule 2 in `CLAUDE.md`.

### Two things every contributor does

#### 1. Sign off every commit (DCO)

Every commit carries a Developer Certificate of Origin sign-off:

```bash
git commit -s
```

The sign-off certifies what <https://developercertificate.org/> says: that you
wrote the change or have the right to submit it under the license of the files
you touched. Use your real name and a working email address. Commits without
a sign-off are not merged.

#### 2. Sign the CLA once

Before your first pull request is merged you will be asked to agree to
[`CLA.md`](CLA.md). It is the Harmony Individual Contributor License Agreement
with outbound Option Five, which means:

- **You keep your copyright.** The CLA is a license to the maintainer, not an
  assignment.
- **The maintainer may license your contribution under other terms as well**
  — for example under a future version of the additional permissions for a
  new store — and must always also offer it under the license the project
  used the day you submitted it.
- **Governing law is Sweden.**

What the CLA cannot do: withdraw a version already released. Every release
under the AGPL stays under the AGPL (section 2 of that license), and anyone
may keep using and forking it.

**Signing the CLA.** The signing mechanism (a CLA-assistant check on the pull
request, or a signatures file in the repository) is set up as part of the
go-public checklist, issue #100. Until it is live, agreeing in a pull-request
comment — "I have read CLA.md and agree to it" — under the name and email of
your sign-offs is what the maintainer will ask for.

### Code you did not write

If a contribution contains code, text, images or data that you did not author
yourself — copied from another project, generated with a tool from someone
else's material, or written by a colleague — say so in the pull request: what
it is, where it came from and under which license. It can only be accepted if
that license is compatible with the directory it lands in, and it must keep
its original notices. This is what the DCO's clause (b) and the CLA's
section 3(d) refer to.

Never contribute personal data of any kind — hard rule 7 in `CLAUDE.md` lists
what that covers.
