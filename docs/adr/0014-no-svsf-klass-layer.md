# ADR 0014: SvSF sessions carry no klass layer

Status: accepted (2026-09-21)

## Context

ADR 0011 made regelverk first-class and left one question open: whether an
SvSF session should also carry a **klass**, the way an SPSF one carries
`shooter_class`. That was the last remaining part of #116, and item (a) of
#351.

SvSF does publish a klass layer — Tävlings-PM Pistol §14, transcribed in
docs/reference/svsf-rules.md. It is four different things wearing one heading:

- **§14, hederspris klass 1/2/3** — a skill class, earned per gren from the
  previous calendar year's ranking competitions (540/520 in fripistol,
  565/545 in grovpistol, and so on), held for a year at a time, with
  carry-over rules between grenar.
- **§14.1 junior- och ungdomsklasser** — junior äldre (19–21) and yngre (≤18),
  then Lp16, Lp13 Stående, Lp13 and Lp11.
- **§14.2 veteranklasser** — Vet 45, 55, 65, 70, 75, 80, 85, 90.
- **§14.4 LP Stöd and §14.5 stödhandsklasser** — a seated class with a
  support, and two-handed classes in luftpistol, sportpistol, grovpistol and
  standardpistol.

None of the four lands cleanly on what the app already has. The veteran bands
are eight where `AgeCategory` has two. The hederspris klass is per gren where
`ShooterProfile.skillClass` is one value for the whole shooter. And Lp11/13/16,
LP Stöd and the stödhandsklasser are not categories at all — they are
different matches (40 shots, seated, with a support), so encoding them as
classes would describe the shooter while leaving the app scoring the wrong
program.

## Decision

**Do not model it.** SvSF sessions carry `event_id` and nothing else; no
`shooter_class` value, no new column, no change to `EntryCategory`.

The transcription in docs/reference/svsf-rules.md stays as the record, so the
work is a modelling decision away rather than a reading task away if this is
ever revisited.

## Why

A klass says which prize table a result is judged against. That is a
competition-administration fact, and the app is a personal logbook: it records
what was shot, and the organiser decides what it was worth. Everything the
klass layer would add is either already known from the event, or is something
the app cannot honestly know.

The hederspris klass is the clearest case. The app holds the scores §14 is
graded on, so deriving the klass looks tempting — but §14 counts only the
previous year's **ranking competitions**, which the app does not distinguish
from a club evening. It would produce a confident number that is wrong
whenever the shooter's year did not happen to consist of ranking
competitions. Asking the shooter to type their klass instead buys a label on a
session nobody is judging.

## Consequences

- ADR 0011's closing "a class layer for SvSF sessions is a maintainer
  decision" is settled by this ADR, in the negative.
- `shooter_class` keeps meaning exactly one thing: an SPSF klass. The
  klass/event split in `app/src/db/schema.ts` and
  `shared/src/disciplines/entries.ts` stands as written.
- A Swedish shooter logging a veteranmästerskap records the event and, if they
  want the band, the competition name. Nothing is lost that the session's own
  fields do not already hold.
- This is a decision about the app's model, not about the rules. If SvSF
  competition administration ever moves into scope — entries, start lists,
  prize tables — the transcription is there and this ADR is the thing to
  supersede.
