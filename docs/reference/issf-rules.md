# ISSF pistol domain facts

Verified extraction with rule/table citations. Sources (PDFs kept outside
the repo, fetched 2026-09-01):

- **Pistol** — *ISSF Rule Book, Pistol Rules (Section 8)*, EDITION 2025
  (First Print 12/2025), effective 1 January 2026 ("the Pistol Rules").
  Mirror used: tiroalcorcon.com/wp-content/uploads/2026/01/PISTOL_ISSF2026.pdf
- **General Technical Rules (Section 6)** and its **Annex — Rules for
  Paper Target Scoring**, for target ring dimensions and paper-target
  procedure ("the GTR"). Mirror used:
  tiroalcorcon.com/wp-content/uploads/2020/10/1.-ISSF-General-Technical-Rules.pdf
  — print date on the file is 2020, no edition/effective date is stamped
  in the extracted text; ring dimensions are stable figures unchanged
  across editions and independently cross-checked against a 2025 web
  search snippet quoting the same values (10 ring 100 mm for RFP, 59.5 mm
  black diameter for 10m AP). **VERIFY** the GTR edition currency if the
  maintainer wants a page-stamped citation.

When these sources and this file disagree, the sources win — fix this
file. Discipline/program JSON files carry their own inline citation via
this doc; there are no per-value code comments in JSON (JSON has no
comment syntax), so this file is the citation record for
`shared/src/disciplines/definitions/issf-*.json` and
`shared/src/disciplines/programs/issf-*.json`.

## Federation-scoped weapon groups (§6.4a)

ISSF has **events, not vapengrupper**. All five ISSF disciplines below
ship `"weaponGroups": []` — `weaponGroupsForDiscipline()` resolves that
to an empty list rather than throwing, and `shooterClassesForDiscipline()`
already returns `GENERIC_SHOOTER_CLASSES` (`[]`) for any
non-`'SPSF'` federation (see `shared/src/disciplines/classes.ts`). No
schema change was needed; this is the "keep it minimal, documented"
option named in the task, not a new concept.

## 10m Air Pistol (Luftpistol)

Pistol Rules Rule 8.11 (Pistol Events Qualification Table, p. 372): **60
competition shots**, men & women identical format. Time limit 75 minutes
(EST) / 90 minutes (paper); 15 minutes preparation and sighting time;
**sighting shots unlimited** during that time (4 sighting targets,
paper) — there is no fixed sighter-series count, unlike the SPSF
programs. Because our `structure.sighterSeries` can only express a fixed
leading count of full series, this is shipped as `sighterSeries: 0`
(no pre-created sighter skeleton) — sighting is logged as ordinary
untimed series with the existing `is_sighter` flag, not auto-generated.
This is a modeling limitation, not a guessed number.

**Series grouping**: GTR Annex — Rules for Paper Target Scoring, Rule
4.1.c: "Immediately after each series of **ten (10)** shots, the athlete
must put the ten (10) targets in a convenient place..." — this is the
official procedural unit, so `defaultSeriesLength`/`shotsPerSeries` = 10,
giving a fixed skeleton of **6 series of 10 = 60 shots**, matching the
qualification table's fixed shot count. No formal per-series time limit
is defined (the 75/90 minute limit is a whole-round budget, not a
per-series one), so the program's groups carry no `timeLimitSeconds`.

**Target** (GTR Rule 6.3.4.6, "10m Air Pistol Target"): 10 ring 11.5 mm
(±0.1), 9 ring 27.5 mm (±0.1), 8 ring 43.5 mm (±0.2), 7 ring 59.5 mm
(±0.5), 6 ring 75.5 mm (±0.5), 5 ring 91.5 mm (±0.5), 4 ring 107.5 mm
(±0.5), 3 ring 123.5 mm (±0.5), 2 ring 139.5 mm (±0.5), 1 ring 155.5 mm
(±0.5); inner ten 5.0 mm (±0.1); black covers rings 7–10 (59.5 mm
diameter); minimum visible card 170×170 mm.

**Scoring**: GTR Rule 6.3.3.2 — Pistol Qualification is scored in full
ring values (integer); only specific *rifle* events are decimal in
qualification. Rule 6.3.3.3 — Finals are decimal, but v1 does not model
finals (`supportsFinal: false`; see task framing). `allowsDecimal: false`.

## 25m Sport Pistol / Sportpistol (women's event; current ISSF name "25m Pistol")

Pistol Rules Rule 8.11 table + Rule 8.7.6.4: **60 shots**, divided into
two 30-shot stages:

- **Precision Stage**: 6 series of 5 shots, **240 seconds per series**
  (8.7.6.4 table). One 5-shot sighting series is allowed before the
  stage (8.7.6.4.a); no separate time limit is stated for it — it takes
  the stage's 240 s, same pattern as the SPSF milsnabb provserie
  inheriting omgång 1's limit.
- **Rapid-fire Stage**: 6 series of 5 shots. Per shot, not per series:
  the target is shown 5 times for 3.0 s (−0.0/+0.2) each, 7 s (±0.1)
  between exposures, one shot per exposure (8.7.6.4.i). This does not
  fit the `timeLimitSeconds`-per-series field (that field means "whole
  series has N seconds", not "5 timed single-shot exposures") — the
  rapid-fire group therefore ships with **no** `timeLimitSeconds`, and
  the true per-shot timing is documented here rather than forced into a
  field that would misrepresent it.

**Targets — this event genuinely uses two different targets**, one per
stage (GTR 6.3.4.4/6.3.4.5, both explicitly listing "the precision
stage of ... the 25m Pistol event" / "Rapid Fire stages of ... the 25m
Pistol event"). Our schema has one `targetFace` per discipline, so
`targetFace` is set to `issf-25m-precision` (the precision-stage target)
as the representative id; the rapid-fire stage's distinct target
(`issf-25m-rapid-fire`, same dimensions as 25m Rapid Fire Pistol below)
is documented here, not modeled as a second field. This is a schema
limitation, not a guessed value — flagging for a possible v2
per-program `targetFace` override.

**Scoring**: integer in qualification (GTR 6.3.3.2); `allowsDecimal:
false`. Finals for this event use hit/miss hit-zones, not decimal rings
(GTR 6.3.3.3 exception) — moot since `supportsFinal: false`.

## 25m Standard Pistol (Standardpistol)

Pistol Rules Rule 8.7.6.5: **60 shots, 3 stages of 20 shots**, each stage
4 series of 5 shots:

| Stage | Series × shots | Time limit |
| ----- | --------------- | ---------- |
| 1     | 4 × 5           | 150 s      |
| 2     | 4 × 5           | 20 s       |
| 3     | 4 × 5           | 10 s       |

One 5-shot sighting series is allowed before MATCH firing, at 150 s
(8.7.6.5.a) — matches the fixed structure's first group's time limit, no
separate field needed (same pattern as milsnabb). 3 minutes preparation
time (8.7.6.1.e).

**Target**: GTR Rule 6.3.4.5, "25m Precision and 50m Pistol Target" —
this rule explicitly names "the 50m Pistol **and 25m Standard Pistol**
events" as sharing one target, so no dual-target problem here. Same
dimensions as `issf-25m-precision` below.

## 25m Rapid Fire Pistol (Snabbpistol; men's event)

Pistol Rules Rule 8.7.6.3.a: **60 shots, 2 stages of 30 shots**. Each
stage: 6 series of 5 shots — 2 series at 8 s, 2 at 6 s, 2 at 4 s, one
shot per target across 5 targets per series. Rule 8.7.6.3.b: **one**
5-shot sighting series (at 8 s) allowed **before each stage** — our
schema's `sighterSeries` is a single leading count before all groups, so
this ships as **one leading sighter** (5 shots, inheriting the first
group's 8 s limit) rather than two, with the full 60 scored shots
represented as **12 series in the correct repeating 8/6/6/4/4 pattern**
across both stages (`groups: [{2,8},{2,6},{2,4},{2,8},{2,6},{2,4}]`).
This compresses "sighter before each stage" into "one sighter up front"
— a documented modeling choice forced by the schema/app's one-sighter-
per-section convention, not a change to any verified shot count or time
limit. 3 minutes preparation time (8.7.6.1.e).

**Does this fit the ring-scoring model, or should it defer like fält
(hit/figure scoring)?** It fits. Qualification scoring is full ring
values (0–10, X inner ten) against a printed ring target (GTR 6.3.4.4) —
the same `scoring: 'rings'` model as every other program here. Only
*finals* (not modeled, `supportsFinal: false`) use ISSF's newer hit-zone
scoring (GTR 6.3.3.3); qualification, which is all v1 logs, is ordinary
ring scoring. Unlike fältskjutning — genuinely hit/miss with no ring
value at any phase — there is no scoring-model mismatch here.

**Target** (GTR Rule 6.3.4.4, "25m Rapid Fire Pistol Target"): 10 ring
100 mm (±0.4), 9 ring 180 mm (±0.6), 8 ring 260 mm (±1.0), 7 ring 340 mm
(±1.0), 6 ring 420 mm (±2.0), 5 ring 500 mm (±2.0); inner ten 50 mm
(±0.2); black covers rings 5–10 (500 mm diameter); minimum visible card
550×520–550 mm.

**Scoring**: integer in qualification (GTR 6.3.3.2); `allowsDecimal:
false`.

## 50m Pistol (Fripistol; historically "Free Pistol")

Pistol Rules Rule 8.11 table: **60 shots**, 5 shots per paper competition
target — same 5-shot grouping convention as the SPSF precision/milsnabb
programs. Time limit 1 h 30 min (EST) / 1 h 45 min (paper); 15 minutes
preparation; **sighting shots unlimited** during that time (2 sighting
targets) — same "unlimited, not a fixed series" situation as 10m Air
Pistol, so `sighterSeries: 0` for the same documented reason. Fixed
skeleton: **12 series of 5 = 60 shots**, no per-series time limit (the
1.5 h figure is a whole-round budget).

**Event status (VERIFY-adjacent, but confirmed present)**: 50m Pistol
was dropped from the Olympic programme after Tokyo 2020, but it is
**still a currently defined ISSF event** — it appears in Rule 8.11 of
the Pistol Rules edition effective 1 January 2026 (the rulebook in
force as of writing), so it is retained here as a "legacy/still-defined"
event, not removed. If the maintainer wants an explicit Olympic-status
flag, that is a schema addition out of this task's scope.

**Target**: GTR Rule 6.3.4.5, "25m Precision and 50m Pistol Target" —
same target and dimensions as 25m Standard Pistol above (`issf-25m-
precision`): 10 ring 50 mm (±0.2) down to 1 ring 500 mm (±2.0) in 50 mm
steps, inner ten 25 mm (±0.2), black covers rings 7–10 (200 mm).

**Scoring**: integer in qualification (GTR 6.3.3.2); `allowsDecimal:
false`.

## Deferred, not encoded

- **10m Air Pistol Mixed Team** (Rule 8.11: 2×30 shots) — a team event,
  not an individual program; out of scope for this per-shooter data
  model.
- **25m Centre Fire Pistol** — same structure family as 25m Sport
  Pistol (precision + rapid stages) but a distinct event with its own
  qualification table row; not requested, not encoded.
- **Finals of any event** — decimal or hit-zone scoring, eliminations;
  a different scoring world per the implementation plan's framing.
  `supportsFinal: false` on every program above.
