# ADR 0002: Freeform series with per-series flags, not fixed program stages

Status: accepted (2026-09-01)

## Context

Early drafts modeled competitions as programs with fixed stage/series
counts (6/7/10 series). Real SPSF precision matches vary (≥6 series
ordinary, 7+3 at championships — SHB C.3.6.1.1), and rigid skeletons
fight how shooters actually log.

## Decision

Series counts are never fixed for freeform programs. Structure lives on
the series rows: `is_sighter` (max one per section — maintainer rule,
consistent with SHB's one provskott series per round) and `is_final`.
When final series exist, three results are derived: beforeFinal,
finalScore, total — standardmedalj evaluates beforeFinal (SHB C.5.1.1.4).
Programs are presets (default shots/series, scoring mode, supportsFinal);
only fixed-format programs (milsnabb: 1 provserie + 4×10s + 4×8s + 4×6s,
SHB J.6.1) declare a `structure` and pre-create their skeleton.

## Consequences

- No schema migration needed for new match formats; new programs are
  JSON data files, addable by PR.
- UI enforces the one-sighter-per-section rule (toggle disables).
- Särskjutning is logged as ordinary extra series in v1.

## Amendment (2026-10-03, #476)

A fixed-format program's groups carry their own `sighterSeries` and an
optional `targetFace`. Nationell helmatch needs a sighter before two of its
three delmoment and a different face for each (SHB I.6.1, I.6.6.2). The
one-sighter-per-section rule now guards freeform sessions only; a
fixed-format session takes its skeleton as the truth. Still no Drizzle
change: a series resolves its group, time limit and face by position.
