# ADR 0016: a second scoring model — `hits` — for fältskjutning

Status: accepted (2026-09-21)

## Context

The discipline schema has always said `scoring: 'rings'` — a literal, not a
choice (`shared/src/disciplines/schema.ts`). Every discipline the app shipped
scored a shot by the ring it landed in, and `targetFace` named the one face the
shot was scored against.

Fältskjutning does not work that way, and it is the discipline the maintainer
shoots most often outside precision (issue #315: three years of logged data
contain no fält session at all, because nothing could record one).

SHB 2026 Del D, now verified in `docs/reference/spsf-shb-2026.md` (PR #327):

- A round is **6–10 skjutstationer, six shots at each** (D.6.1, D.6.4). The
  station count belongs to the competition, not to the discipline.
- A station yields **hits (0–6), figures hit**, and — only where the arrangör
  designated a poängmål — **points** (D.6.10.1–2). Nothing is scored per shot:
  holes are counted per figure after the series, so no hole can be attributed
  to a shot number.
- The result is presented **two ways over the same two numbers** (D.6.11):
  vanlig fält as "antal träff i antal figurer", poängfält as one sum of one
  point per hit plus one per hit figure. The same event is published either way
  from one year to the next.
- The two forms have **different tie-break sequences** (D.6.11.2.1.1 /
  D.6.11.2.1.2), both ending in a countback from the last station — on hits in
  one, on hits + figures in the other.
- There is no single target face: Del D ships a figure catalogue (D.7.1).

## Decision

**`scoring` becomes an enum, `'rings' | 'hits'`, and `targetFace` becomes
rings-only.** A `hits` discipline declaring a `targetFace`, or allowing
decimals, is rejected by the schema rather than tolerated.

**Poängfält is a result mode, not a second discipline.** One `spsf-falt`
definition; how the result is read is a property of the competition, which is
what SHB describes and what the WebShooter corpus shows (the same event
published as Fält one year and Poängfält the next).

**The poängmål's ring points are a separate quantity from the poängfält sum.**
They are recorded, never derived — SHB names poängmål throughout Del D and
defines no ring scheme for a fält figure (open `VERIFY:`), so a points maximum
is not a value the app may compute.

**A `hits` discipline is registered but not offered.** `ringScoringDisciplines()`
filters the new-session picker, the ShotLog import screen and the ShotLog tag
vocabulary, because all three assume a ring value per shot. The filter is
deleted, not extended, when a station entry UI exists.

**`spsf-falt` ships no program.** A program's `shotsPerSeries` and `structure`
describe a ring course; the station count is the competition's (ADR 0002's
freeform rule again).

## Consequences

- The scoring model is a pure module (`shared/src/scoring/falt.ts`) with no
  persistence behind it yet. The `series`-level columns a station needs, and
  their Drizzle migration, land with the entry UI — a migration adding columns
  nothing writes would be half a feature.
- Three things SHB upplaga 21 does not answer stay unmodelled rather than
  guessed (hard rule 4): whether a **särskjutning**'s result enters the
  recorded score or only the placement; whether a station can be **scratched**
  at all (Del D prescribes omskjutning, not annulment); and a **poängmål's ring
  values**. Each is an open question on #315.
- Standardmedalj and märke stay out of fält by construction, and are now
  regression-tested that way: fält's standardmedalj is placement-only
  (C.5.1.2.1) and fältskyttemärket is a separate, per-competition märke
  (Bilaga 1 mom 5.7.1) — neither is derivable from a session.
- Magnumfält (Del E) remains a discipline of its own, unbuilt.
