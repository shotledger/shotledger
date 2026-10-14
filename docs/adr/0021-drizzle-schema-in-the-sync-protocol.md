# ADR 0021: the Drizzle tables live in the Apache-2.0 sync protocol

Status: proposed (2026-10-14). Amends ADR 0017. Awaits the maintainer's
choice on #697; nothing that depends on it merges before then.

## Context

#697 makes `/sync/push` refuse a row that a device could not apply. The
maintainer chose drizzle-zod (2026-10-13): each table's payload schema is
derived from its Drizzle table, so a column added to the schema reaches the
server with no second copy to keep in step
(`docs/specs/sync-payload-validation-spec.md` C1).

ADR 0017 lets the ELv2 Worker compile only `shared/src/sync/`, which is
Apache-2.0 and may import only `zod`. The Drizzle tables were AGPL, first in
`app/src/db/schema.ts` and then in `shared/src/db/schema.ts` (#813). The
server cannot derive anything from them without compiling AGPL code.

## Decision

1. `shared/src/sync/schema.ts` holds the Drizzle tables, Apache-2.0 under the
   existing `REUSE.toml` entry for `shared/src/sync/**`.
   `app/src/db/schema.ts` re-exports it, so the app's `@/db/schema` imports
   and drizzle-kit (`app/drizzle.config.ts`) are unchanged.
   `shared/src/sync/tables.ts` maps each synced table name to its table.
2. `shared/src/sync/` may import `drizzle-orm`, `drizzle-orm/sqlite-core` and
   `drizzle-zod` besides `zod` (all Apache-2.0). The ESLint rule that
   enforces ADR 0017 says so.
3. `backend/src` may import `@shotledger/shared/src/sync/payload-schemas`
   besides `@shotledger/shared/src/sync`. The payload schemas stay out of the
   sync barrel and so out of the app and web bundles (spec N9).

An esbuild bundle of `backend/src/index.ts` with a metafile lists
`shared/src/sync/{index,protocol,merge,text-limits,schema,tables,payload-schemas}.ts`
as its only `shared/` inputs (904 modules, 2026-10-14).

## Why

The table definitions are the column list of every synced row, which is the
wire format: each pushed payload is keyed by those column names. ADR 0017
already reasons that the wire format is an idea and that nothing is given
away by making the protocol permissive. Moving the definitions keeps one
source of truth, which is what the maintainer chose drizzle-zod for.

## Alternatives

- **A generated, zod-only column list in `shared/src/sync/`,** checked
  against the AGPL tables by an app test. Leaves the tables AGPL and ADR
  0017's import rule as it is, but drops drizzle-zod for hand-written
  generation, the duplication the maintainer prefers a library over.
- **A copy of the schema in `backend/`.** A second source that drifts.
- **Leave #697 until the relicensing audit settles the licence map.**

## Consequences

- The schema is Apache-2.0 from this change on. The scoring engine,
  compliance, the sync client and the rest of `shared/` stay AGPL.
- `shared/src/sync/*.ts` is in the gauntlet's `mutate` list, but
  `schema.ts` is excluded from it, and so from the 100% coverage gate,
  which reads the same list: it is table declarations only, checked by
  drizzle-kit and the app's migration tests. `tables.ts` is in the list;
  its map is module-load code that `ignoreStatic` skips.
