# ShotLedger

Target Shooting Log & Scoring — a donation-funded app for target
shooters: training and competition logging, camera-based target scoring,
and Swedish license compliance (FAP 551-3). Offline-first; no account
required. Android first, kept iOS-compatible throughout.

Private for now. Licensing: see [`LICENSE`](LICENSE) and ADR 0017.

## Where things are

| Path                              | What it is                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/`](app/README.md)           | The React Native + Expo app: screens, local SQLite database, i18n, platform wrappers. `app/PRODUCT.md` says what the product is and why.                                         |
| [`shared/`](shared/README.md)     | Pure TypeScript with no React Native imports: scoring, disciplines and regulations, compliance, exports, sync protocol. Used by the app and the backend.                         |
| [`backend/`](backend/README.md)   | Optional Cloudflare Worker for account, sync and photo backup. Never deployed from this repo by an agent.                                                                        |
| `docs/`                           | Architecture, ADRs, the implementation plan, verified rule-book references, evidence-first specs, release checklist, and the user manual.                                        |
| `docs/manual/`                    | The **user** manual (EN + SV), published with MkDocs from `mkdocs.yml`. Gated by `mkdocs build --strict` and the translation-freshness script.                                   |
| `scripts/`                        | Repo gates and generators run by `pnpm check` and by hand — see below.                                                                                                           |
| `patches/`                        | pnpm patches for two dependencies, each with its reason in `pnpm-workspace.yaml`.                                                                                                |
| [`tools/cv/`](tools/cv/README.md) | TypeScript tools that run the app's photo-scoring CV on real photos kept outside the repo, label holes, fit the hole models and write the CV fixtures. Not part of `pnpm check`. |
| `stryker.config.json`             | Mutation-testing configuration for the evidence-first modules.                                                                                                                   |

## Getting started

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

## Checks

`pnpm check` is what CI runs: TypeScript for every package, the i18n key
gate, the license-list gate, the export-schema gate, ESLint, Prettier,
Vitest and the app's Jest suite. Two documentation gates are separate
because they need Python: `mkdocs build --strict` and
`node scripts/docs-translation-check.mjs`.

The modules the maintainer does not read line by line — scoring,
compliance, CSV, sync — are developed evidence-first (see
`.claude/skills/old-coder/`): each has a spec and an evidence report under
`docs/specs/`, 100% coverage enforced by `pnpm coverage`, and a mutation
gate. `pnpm gauntlet` runs every layer.

### `scripts/`

| Script                                              | Run by                                         | What it guards                                                                                          |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
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
| `i18n-check-negative-control.mjs`                   | by hand                                        | Proves the i18n gate can still fail (mutates the JSON, expects a nonzero exit, restores it).            |

### Mutation testing

[Stryker](https://stryker-mutator.io/) changes the source in small ways —
flips a `<` to `<=`, deletes a branch, replaces a constant — and runs the
tests against each mutant. A mutant the tests still pass on "survived",
which means a bug of that shape would ship unnoticed. The score is the
share of mutants killed; `stryker.config.json` breaks the build below 95%
and lists exactly which modules are mutated. Run `pnpm mutation`. It is
slow, so it is part of `pnpm gauntlet`, not of `pnpm check`.

## Working in this repo

- Branch per change, Conventional Commits, every commit DCO-signed
  (`git commit -s`). Never commit to `main`; merges are the maintainer's.
- Secrets never enter the working tree. Real personal data never does
  either, in any form: fixtures are synthetic.
- Regulatory values (scoring thresholds, class ages, activity counts) are
  read from the rule books cited in `docs/reference/` and never guessed.
- A change that alters what a user sees updates `docs/manual/` in the same
  pull request.

`CLAUDE.md` (with the `CLAUDE.md` in `app/`, `shared/`, `backend/` and
`docs/`) is the full set of rules; it applies to human contributors just as
much.

## Reading order

1. [`app/PRODUCT.md`](app/PRODUCT.md) — what and why.
2. [`docs/architecture.md`](docs/architecture.md) — the tech choices and
   the iOS-readiness rules.
3. [`docs/adr/`](docs/adr/) — the decisions behind them.
4. [`docs/implementation-plan.md`](docs/implementation-plan.md) — the
   execution spec, milestone by milestone.
5. Issues #346–#355 — what is outstanding, one topic issue each.
