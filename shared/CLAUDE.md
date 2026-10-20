# shared/ — domain logic shared by app and backend

Rules that apply everywhere are in the root `AGENTS.md`. Changes to
`src/scoring/`, `src/compliance/` and the sync engine go through the
old-coder loop (`.claude/skills/old-coder/`).

## Evidence-first layers

Run from the repo root:

- `pnpm coverage` — vitest + v8, 100% threshold on the modules in
  `stryker.config.json`'s `mutate` list (the one list both layers read);
  exits non-zero when missed. `pnpm check` runs it, so CI does too. The
  rest of the code it reaches carries `COVERAGE_FLOOR` (a ratchet).
- `pnpm mutation` — Stryker. `stryker.config.json` sets `ignoreStatic`
  because the vitest runner cannot activate mutants in module-load code.
  It overwrites the vitest JUnit file, so run `pnpm check` again before
  `pnpm reqstool:status`.
- `pnpm mutation:schema` — on-disk mutation of the zod schemas, which is
  what `ignoreStatic` skips. Lookup tables are skipped too, and only a test
  pinning every value checks them.
- `pnpm gauntlet` — every layer.

## Property-based tests

fast-check is the default, alongside example tests, for code with one of
these shapes; put the properties in a `*.property.test.ts` beside the module:

- **Round trips**: encode/decode, export/import, pack/unpack, parse/format
  (`backup/container.property.test.ts`, `json-export/round-trip.property.test.ts`).
- **Dates and time windows**: anything on local days, DST or "within N
  months" (`dates/local-day.property.test.ts`). The runner's zone is
  Europe/Stockholm.
- **Invariants over scores and series**: totals, ordering independence,
  merge commutativity (`scoring/group.property.test.ts`, `sync/merge.test.ts`).

Generators produce synthetic data only. Example tests still pin the cases a
rule book or bug report names.

## Sync client

A change to `src/sync-client/` is cheapest to exercise end to end with the
backend's in-process test (`backend/test/sync-client.spec.ts`, see
`backend/CLAUDE.md`), not on the emulator.
