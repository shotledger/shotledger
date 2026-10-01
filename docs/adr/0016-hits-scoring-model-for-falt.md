# ADR 0016: a second scoring model — `hits` — for fältskjutning

Status: accepted (2026-09-21)

## Context

The discipline schema said `scoring: 'rings'` — a literal, not a choice
(`shared/src/disciplines/schema.ts`). Every discipline scored a shot by the
ring it landed in, against the one `targetFace` it named.

Fältskjutning does not work that way (SHB 2026 Del D, transcribed in
`docs/reference/spsf-shb-2026.md`): a round is 6–10 stations of six shots,
the station count belongs to the competition, nothing is scored per shot, a
station yields hits, figures hit and sometimes poängmål points, and the same
two numbers are presented either as vanlig fält or as poängfält, with
different tie-breaks. There is no single target face.

## Decision

**`scoring` becomes an enum, `'rings' | 'hits'`, and `targetFace` becomes
rings-only.** A `hits` discipline declaring a `targetFace`, or allowing
decimals, is rejected by the schema rather than tolerated.

**Poängfält is a result mode, not a second discipline.** One `spsf-falt`
definition; how the result is read is a property of the competition, which is
what SHB describes and what the WebShooter corpus shows (the same event
published as Fält one year and Poängfält the next).

**The poängmål's ring points are a separate quantity from the poängfält sum.**
They are recorded, never derived — SHB defines no ring scheme for a fält
figure, so a points maximum is not a value the app may compute.

**`spsf-falt` ships no program.** A program's `shotsPerSeries` and `structure`
describe a ring course; the station count is the competition's (ADR 0002's
freeform rule again).

## Consequences

- The scoring model is a pure module (`shared/src/scoring/falt.ts`); station
  persistence and entry are specified in `docs/specs/falt-stations-spec.md`.
- Code that assumes a ring value per shot (the ShotLog import and its tag
  vocabulary) filters through `ringScoringDisciplines()`.
- Standardmedalj and märke stay out of fält by construction, and are
  regression-tested that way: fält's standardmedalj is placement-only
  (C.5.1.2.1) and fältskyttemärket is a separate, per-competition märke
  (Bilaga 1 mom 5.7.1) — neither is derivable from a session.
- Magnumfält (Del E) remains a discipline of its own, unbuilt.
