# ADR 0006: Session kind is an explicit column, not derived per row

Status: accepted (2026-09-03)

## Context

A session either logs scored series or a fixed number of fired shots —
never both — but that shape was previously inferred at read time
(`deriveSessionShapeFromContent`, a stand-in added for the Home list in
#67) from whatever series/extra-rounds rows happened to exist. Inference
is fragile: the same data can look like either shape depending on what
has been entered so far, and it gives the UI nothing to gate on before
the first row exists.

## Decision

`sessions.kind` is an explicit `'series' | 'rounds'` column (migration
`0006_session_kind`, `NOT NULL DEFAULT 'series'`), chosen once at session
creation and immutable afterward — it is excluded from
`UpdateSessionInput`, because flipping it would strand a session's
series or its extra rounds behind a UI that no longer shows them.

Backfill for existing rows: any live `series` row ⇒ `'series'` (so a
session with both series and `extra_rounds` keeps both and stays
`'series'`); no live series row and `extra_rounds > 0` ⇒ `'rounds'`;
neither ⇒ `'series'`, the shape that hides nothing. `extra_rounds` keeps
its existing meaning — on a `'rounds'` session it _is_ the shot count.

## Consequences

- The New Session form gates on `kind` at creation instead of the UI
  inferring shape from content afterward.
- `deriveSessionShapeFromContent` is superseded; the Home list reads the
  column directly.
- A session's shape is now knowable before any series or rounds have
  been logged.
