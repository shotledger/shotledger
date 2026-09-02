# ADR 0003: Build the sync engine (DIY changelog), don't adopt a library

Status: proposed (2026-09-01; accepted when this PR is merged)

## Context

v2 adds optional cloud sync. Before building, a full survey (2026-09)
evaluated reusing an existing local-first sync engine against our stack:
Expo + expo-sqlite + Drizzle (schema already carries `updated_at`,
`deleted_at` tombstones, UUIDv7 ids), Cloudflare-only backend, per-user
data with two devices at most, last-write-wins acceptable.

Surveyed: PowerSync (incl. self-hosted), ElectricSQL, Turso embedded
replicas, LiveStore, TinyBase, WatermelonDB sync, Replicache, Zero,
cr-sqlite, SQLSync, Evolu, Triplit, InstantDB, Jazz, and
community sync-on-Durable-Objects projects.

## Decision

Build the per-user changelog protocol ourselves on Cloudflare Workers +
D1 (photos to R2). Three findings were decisive:

1. **No library is simultaneously Cloudflare-native and
   schema-preserving.** PowerSync/ElectricSQL/Zero require Postgres (or
   Mongo/MySQL) sources — no D1 path. Turso keeps the client stack but
   replaces D1 with a competing platform (and its offline-writes feature
   is beta). LiveStore/TinyBase/WatermelonDB/Evolu/Triplit/InstantDB/
   Jazz all require abandoning the Drizzle schema for their own data or
   event model.
2. **Our problem is the easy version of sync.** These libraries earn
   their complexity solving multi-writer conflict resolution for
   collaborative data. One user, two devices, LWW-per-row: the hard part
   doesn't exist here.
3. **Maintenance risk.** Replicache was archived in 2026; WatermelonDB
   shows staleness; LiveStore is pre-1.0; SQLSync says "not for
   production"; Triplit lost its founding team. A donation-funded app
   that must still work in five years should not depend on any of them.

## Protocol guardrails (from documented real-world failures)

- Merge ordering uses server-assigned/logical ordering, never trusted
  client clocks.
- Tombstone wins on conflict — explicit precedence, not naive
  `max(updated_at)`.
- Local write + outbox enqueue happen in ONE SQLite transaction.
- Strict `pull → push → ack` cycle; no concurrent independent loops.
- Tombstone retention longer than the max supported offline window.
- Catch-up/initial sync paginates by cursor on `(updated_at, id)`.
- Schema migrations version the protocol: a client older than the
  server's minimum supported version must upgrade before syncing.

## Photo policy (same backend, decided with the maintainer)

Client resizes before upload (~2048 px JPEG ≈ 300–600 KB + thumbnail);
originals never leave the device. Server enforces: max object size
(~1.5 MB), per-user storage quota (initial: 1 GB), and an upload rate
limit (initial: 60/hour via the Workers rate-limiting binding). Quotas
tracked in D1; nothing is deleted server-side without user action.

## Consequences

- Worker endpoints, D1 changelog tables, and the client sync loop are
  ours to write and test (old-coder loop applies — this is sync-engine
  code per CLAUDE.md).
- Revisit trigger: if Turso's offline writes exit beta AND the
  Cloudflare-only constraint is ever relaxed, re-evaluate before
  extending the protocol with new capabilities.
