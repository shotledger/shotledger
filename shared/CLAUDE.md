# shared/ — domain logic shared by app and backend

Rules that apply everywhere are in the root `CLAUDE.md`. Changes to
`src/scoring/`, `src/compliance/`, `src/csv/` and the sync engine go through
the old-coder loop (`.claude/skills/old-coder/`).

## Evidence-first layers

Run from the repo root:

- `pnpm coverage` — vitest + v8, 100% threshold on
  `shared/src/{scoring,disciplines}`; exits non-zero when missed.
- `pnpm mutation` — Stryker. `stryker.config.json` sets `ignoreStatic`
  because the vitest runner cannot activate mutants in module-load code.
  It overwrites the vitest JUnit file, so run `pnpm check` again before
  `pnpm reqstool:status`.
- `pnpm mutation:schema` — on-disk mutation of the zod schemas, which is
  what `ignoreStatic` skips.
- `pnpm gauntlet` — every layer.

## Sync client

A change to `src/sync-client/` is cheapest to exercise end to end with the
backend's in-process test (`backend/test/sync-client.spec.ts`, see
`backend/CLAUDE.md`), not on the emulator.
