# ADR 0001: Local-first SQLite with optional Cloudflare sync

Status: accepted (2026-08-31)

## Context

The app must work fully offline at ranges, respect a privacy-sensitive
audience (no forced accounts), and run on a donation-scale budget.
Firebase-style cloud-first backends invert all three.

## Decision

The device's SQLite database (expo-sqlite + Drizzle; expo-sqlite chosen
over op-sqlite for its web/WASM support, which the agentic browser loop
requires) is the source of truth. Cloud sync is an optional add-on on
Cloudflare (Workers + D1 + R2 + better-auth) using a per-user changelog:
every row carries `updated_at` and a `deleted_at` tombstone; push/pull
since last sync; last-write-wins per row (each user edits only their own
data — no CRDT engine). Derived values (totals, statistics) are computed,
never stored.

## Consequences

- Every table must carry id (UUIDv7), created_at, updated_at, deleted_at
  from day one; all deletes are soft; queries filter tombstones.
- The app must be fully functional with no account and no network.
- Backend cost stays ~$0–5/month to ~5k users; no vendor SDK lock-in.
- Multi-user shared-record collaboration is out of scope by design.
