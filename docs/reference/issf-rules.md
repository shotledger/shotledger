# ISSF pistol domain facts

Verified extraction with rule/table citations. One of three federation
reference files — see also [SPSF](spsf-shb-2026.md) and [SvSF](svsf-rules.md).

## Where to get the rule books

The ISSF publishes them per section and as one combined book. **Always check
for a newer edition before citing this file** — an edition is stamped on every
page ("EDITION 2025 (First Print 12/2025) Effective 1 January 2026").

| What                             | Link                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ISSF rules and regulations index | <https://www.issf-sports.org/theissf/rules_and_regulations.ashx>                                                                            |
| Combined Rule Book 2026 (PDF)    | <https://www.tiroalcorcon.com/wp-content/uploads/2026/01/ISSF-Rule-Book-2026-Edition-2025-First-Print-12-2025-Effective-1-January-2026.pdf> |
| Pistol Rules, Section 8 (PDF)    | <https://tiroalcorcon.com/wp-content/uploads/2026/01/PISTOL_ISSF2026.pdf>                                                                   |
| General Technical Rules, Sec. 6  | <https://tiroalcorcon.com/wp-content/uploads/2020/10/1.-ISSF-General-Technical-Rules.pdf>                                                   |
| Swedish translations (ch. 6/7/8) | see [SvSF](svsf-rules.md) — these, not the English text, govern Swedish national competitions                                               |

The tiroalcorcon.com links are a club mirror, used because the ISSF's own
index is a JavaScript page whose PDF links are not directly fetchable. The
files are the ISSF's own, edition-stamped. Prefer the ISSF index when it
works; fall back to the mirror.

Editions used for the extraction below, both fetched 2026-09-12:

- **Combined Rule Book**, EDITION 2025 (First Print 12/2025), effective
  1 January 2026 — for the General Regulations (Section 3): the ISSF
  RECOGNIZED SHOOTING EVENTS tables (Rule 3.3, pp. 181-183) and the junior
  definition (Rule 3.7.4.12, p. 43).
- **Pistol Rules (Section 8)**, same edition ("the Pistol Rules").
- **General Technical Rules (Section 6)** and its **Annex — Rules for Paper
  Target Scoring**, for target ring dimensions and paper-target procedure
  ("the GTR"). The print date on that file is 2020 and no edition/effective
  date is stamped in the extracted text; ring dimensions are stable figures
  unchanged across editions and independently cross-checked against a 2025
  web search snippet quoting the same values (10 ring 100 mm for RFP,
  59.5 mm black diameter for 10 m AP). **VERIFY** the GTR edition currency if
  a page-stamped citation is wanted.

When these sources and this file disagree, the sources win — fix this
file. Discipline/program JSON files carry their own inline citation via
this doc; there are no per-value code comments in JSON (JSON has no
comment syntax), so this file is the citation record for
`shared/src/disciplines/definitions/issf-*.json` and
`shared/src/disciplines/programs/issf-*.json`.

## Federation-scoped weapon groups (§6.4a)

ISSF has **events, not vapengrupper**. All six ISSF disciplines below
ship `"weaponGroups": []` — `weaponGroupsForDiscipline()` resolves that
to an empty list rather than throwing, and `shooterClassesForDiscipline()`
already returns `GENERIC_SHOOTER_CLASSES` (`[]`) for any
non-`'SPSF'` federation (see `shared/src/disciplines/classes.ts`). No
schema change was needed; this is the "keep it minimal, documented"
option named in the task, not a new concept.

## Recognized events and their categories (Rule 3.3)

Rule 3.3 is the authority on **which events exist and for whom**; Rule 8.11's
Men/Women column only says how each is shot. Status letters are the tables'
own: `M` men, `MJ` men junior, `W` women, `WJ` women junior, `Olympic` on the
Olympic programme, `WCH` a mandatory World Championship event.

Transcribed from EVENTS FOR MEN AND MEN JUNIOR (p. 182) and EVENTS FOR WOMEN
AND WOMEN JUNIOR (p. 183), pistol rows only:

| Event                  | Men's table   | Women's table | Encoded as                |
| ---------------------- | ------------- | ------------- | ------------------------- |
| 10m Air Pistol         | APM `M, MJ`   | APW `W, WJ`   | `issf-air-pistol`         |
| 25m Rapid-Fire Pistol  | RFPM `M, MJ`  | —             | `issf-rapid-fire-pistol`  |
| 25m Standard Pistol    | STPM `M, MJ`  | STPW `W, WJ`  | `issf-standard-pistol`    |
| 25m Pistol             | SPM `MJ only` | SPW `W, WJ`   | `issf-sport-pistol`       |
| 25m Centre Fire Pistol | CFPM `M only` | CFPW `W`      | `issf-centre-fire-pistol` |
| 50m Pistol             | FPM `M, MJ`   | FPW `W, WJ`   | `issf-free-pistol`        |

Three things this settles that were previously unread or guessed:

- **25m Pistol is `MJ only` for men.** It is recognized for women, women
  juniors and men juniors — but not for senior men. It is the one pistol row
  where the age axis genuinely cannot be folded into the gender one, and so
  the reason `EntryCategory` is a pair rather than a flat enum.
- **25m Standard Pistol and 50m Pistol are still fully recognized**, in all
  four categories. Neither is Olympic; both are WCH. So SvSF needs no
  definition of its own for either — see ADR 0011.
- **25m Centre Fire Pistol has no junior categories at all** (`M only`, `W`).
  Encoded as `issf-centre-fire-pistol` since 2026-09-16 (#228) — SvSF's
  _Grovpistol_, see [SvSF](svsf-rules.md#grovpistol--issf-25-m-centre-fire-pistol).

`shared/src/disciplines/entries.ts` carries this as `ISSF_RULE_33`, one row per
discipline with the status letters verbatim, so it diffs against the table
above line by line.

### Juniors (Rule 3.7.4.12)

> Athletes will remain as Juniors until the 31st December of the year in which
> they become 21 years of age.

Year-based, like SPSF's — so a birth year is enough, and the app never needs a
full date of birth. `ISSF_JUNIOR_MAX_AGE = 21` cites this rule.

Rule 3.7.4.13 adds that an athlete "can be part of the final ranking in one
category only" — the ISSF counterpart to SHB F.2.2's one-start rule. Like that
one it governs ranking at a championship, not what may be logged, so nothing
in the app enforces it.

## 10m Air Pistol (Luftpistol)

Pistol Rules Rule 8.11 (Pistol Events Qualification Table, p. 372): **60
competition shots**, men & women identical format. Time limit 75 minutes
(EST) / 90 minutes (paper); 15 minutes preparation and sighting time;
**sighting shots unlimited** during that time (4 sighting targets,
paper) — there is no fixed sighter-series count, unlike the SPSF
programs. Because a group's `sighterSeries` can only express a fixed
count of full series, this is shipped as `sighterSeries: 0`
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
ring values (integer); only specific _rifle_ events are decimal in
qualification. Rule 6.3.3.3 — Finals are decimal, but v1 does not model
finals (`supportsFinal: false`; see task framing). `allowsDecimal: false`.

## 25m Sport Pistol / Sportpistol (current ISSF name "25m Pistol")

Pistol Rules Rule 8.11 table + Rule 8.7.6.4: **60 shots**, divided into
two 30-shot stages:

- **Precision Stage**: 6 series of 5 shots, **240 seconds per series**
  (8.7.6.4 table). One 5-shot sighting series is allowed before each
  stage (8.7.6.4.a), so each group carries `sighterSeries: 1`; no separate
  time limit is stated for it — it takes the stage's 240 s, same pattern as
  the SPSF milsnabb provserie inheriting omgång 1's limit.
- **Rapid-fire Stage**: 6 series of 5 shots. Per shot, not per series:
  the target is shown 5 times for 3.0 s (−0.0/+0.2) each, 7 s (±0.1)
  between exposures, one shot per exposure (8.7.6.4.i). This does not
  fit the `timeLimitSeconds`-per-series field (that field means "whole
  series has N seconds", not "5 timed single-shot exposures") — the
  rapid-fire group therefore ships with **no** `timeLimitSeconds`, and
  the true per-shot timing is documented here rather than forced into a
  field that would misrepresent it. The stage's own sighting series
  (8.7.6.4.a) inherits that: untimed, on the rapid-fire face.

**Targets — this event genuinely uses two different targets**, one per
stage (GTR 6.3.4.4/6.3.4.5, both explicitly listing "the precision
stage of ... the 25m Pistol event" / "Rapid Fire stages of ... the 25m
Pistol event"). The discipline's `targetFace` is `issf-25m-precision` (the
precision-stage target), and the program's rapid-fire group overrides it with
`issf-25m-rapid-fire` (same dimensions as 25m Rapid Fire Pistol below).

**Scoring**: integer in qualification (GTR 6.3.3.2); `allowsDecimal:
false`. Finals for this event use hit/miss hit-zones, not decimal rings
(GTR 6.3.3.3 exception) — moot since `supportsFinal: false`.

## 25m Centre Fire Pistol (Grovpistol)

Pistol Rules Rule 8.7.6.4 is titled "Specific Rules for 25m Pistol and 25m
Centre Fire Pistol" and opens: "The programme for each event is 60 MATCH
shots divided into two (2) stages of 30 shots each" — the Precision Stage,
six series of five shots at 240 seconds per series, and the Rapid-fire Stage,
six series of five shots; 8.7.6.4.a allows one 5-shot sighting series before
each stage. The 8.11 qualification table's "25m Centre Fire Pistol" row (Men &
Women, 60 shots, 10 shots per target, 1 sighting series of 5 in each stage,
240 s precision series, rapid-fire stage "in rapid-fire programme", 3 minutes
preparation per stage) shares every cell with the 25m Pistol row. What
differs is the gun: Rule 8.4.3.3 admits "any centre fire pistol or revolver,
except a single shot pistol, of calibre 7.62mm to 9.65mm (.30" - .38")",
which the app records on the firearm, not the discipline.

So `programs/issf-centre-fire-pistol.json` is structurally identical to
`issf-sport-pistol.json`, and a test asserts it stays so. The same two faces
as 25m Pistol — precision stage on `issf-25m-precision`, rapid-fire group on
`issf-25m-rapid-fire`; integer scoring (GTR 6.3.3.2), `allowsDecimal: false`.

Rule 3.3: `CFPM M only`, `CFPW W` — no junior event in either table. SvSF
runs it at SM as one open senior class (Tävlings-PM 15.1 "Grovpistol —
Senior (öppen)"), which is the one SvSF-only category on it; see
[SvSF](svsf-rules.md#grovpistol--issf-25-m-centre-fire-pistol).

## 25m Standard Pistol (Standardpistol)

Pistol Rules Rule 8.7.6.5: **60 shots, 3 stages of 20 shots**, each stage
4 series of 5 shots:

| Stage | Series × shots | Time limit |
| ----- | -------------- | ---------- |
| 1     | 4 × 5          | 150 s      |
| 2     | 4 × 5          | 20 s       |
| 3     | 4 × 5          | 10 s       |

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
5-shot sighting series (at 8 s) allowed **before each stage**. The full 60
scored shots are represented as **12 series in the correct repeating
8/8/6/6/4/4 pattern** across both stages
(`groups: [{2,8},{2,6},{2,4},{2,8},{2,6},{2,4}]`), and the first group of
each stage carries `sighterSeries: 1`, so each sighter inherits that group's
8 s limit. 3 minutes preparation time (8.7.6.1.e).

**Does this fit the ring-scoring model, or should it defer like fält
(hit/figure scoring)?** It fits. Qualification scoring is full ring
values (0–10, X inner ten) against a printed ring target (GTR 6.3.4.4) —
the same `scoring: 'rings'` model as every other program here. Only
_finals_ (not modeled, `supportsFinal: false`) use ISSF's newer hit-zone
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

**Event status**: 50m Pistol was dropped from the Olympic programme after
Tokyo 2020, which is not the same as being dropped by the ISSF. Rule 3.3
still recognizes it in four categories — **FPM "M, MJ, WCH"** and **FPW
"W, WJ, WCH"** — so it is a mandatory World Championship event that is not
an Olympic one. That is the whole of its status; the earlier VERIFY here is
resolved, and no Olympic-status flag is needed to say it.

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
- **Finals of any event** — decimal or hit-zone scoring, eliminations;
  a different scoring world per the implementation plan's framing.
  `supportsFinal: false` on every program above.
