---
name: spsf-domain
description: SPSF/ISSF target-shooting domain rules for ShotLedger — ring disciplines (precision, milsnabb) and hit disciplines (fältskjutning, poängfält, magnumfält); series/station/final/sighter structure, märke ("guldserie", fältskyttemärket) and standardmedalj thresholds, vapengrupper and klasser, competition levels, target and figure dimensions, tie-break/särskjutning, licens/intyg rules. Use whenever implementing or reviewing scoring, session structure, compliance, discipline/program definitions, or any Swedish shooting-sport terminology.
---

# SPSF domain rules

Authoritative facts live in `docs/reference/spsf-shb-2026.md` (verified
against Skjuthandboken 2026 with page citations) — **read it before
implementing anything touching scoring, sessions, or compliance**. When
that file and code comments disagree, the reference file wins.

Hard rules that implementations must never violate:

1. **Series counts are never fixed** for freeform programs (precision).
   Only fixed-format programs (milsnabb) pre-create a skeleton.
2. **Max ONE sighter (provskott) series per section** — one in the main
   round, one in the final. What a sighter counts towards depends on where
   you are asking (maintainer, 2026-09-16 and 2026-09-17; see
   `docs/specs/sighters-in-statistics-spec.md`):
   - **Inside a session** it is excluded from the result and from every
     score statistic — session total, series average, in-session stats.
   - **Across sessions** (the Statistics tab's report) it is an ordinary
     series, counted unless the user's Sighters filter excludes it.
   - **Volume metrics always count it**: shots logged, firearm round
     counter, ammo usage — in every scope, filter included.
   - **Guldserie always counts it.** A 50 on a provserie earns the märke
     like any other series; this is not scope- or filter-dependent.
3. When a final exists, three derived results: beforeFinal, finalScore,
   total = sum. Standardmedalj evaluates **beforeFinal** (the
   grundomgång), not the total.
4. **Vapengrupp (gun) and klass (shooter) are orthogonal fields**, never
   one string. Valid vapengrupper depend on discipline (no R in
   precision). Display combined as "C 2".
5. Mästerskap is a **flag on** a competition level (KM = förening + flag,
   SM = riks + flag), never its own level.
6. Märke thresholds (guld A 43 / B 45 / C 46 per series) are
   age-reduced: −1 from the year after turning 55, −2 after 65.
7. A hit counts to the higher ring as soon as the ring's outer edge is
   touched (photo scoring, v2).
8. Never guess regulatory or scoring values — anything not in the
   reference file is VERIFY-with-maintainer.

## Fältskjutning is a hit discipline, not a ring discipline

SHB Del D governs fält; precision's Del F rules do **not** carry over.
Facts and citations: the "Fältskjutning" section of
`docs/reference/spsf-shb-2026.md`. Rules an implementation must respect:

9. **A fält round is stations, not series: 6–10 stations, exactly six
   shots at each** (D.6.1/D.6.4). The station count is a property of the
   competition, never of the discipline — no skeleton.
10. **Nothing is scored per shot.** A station yields hits (0–6), figures
    hit, and — only where the arrangör set a poängmål — points. Holes are
    counted per figure after the series; nobody can attribute a hole to a
    shot number. Model at station level.
11. **Two result modes over the same two numbers**: vanlig fält = "antal
    träff i antal figurer" (two numbers, ranked hits → figures → points);
    poängfält = one sum where **each hit is 1 p and each hit figure is
    1 p** (D.6.11). It is a result mode per competition, not a second
    discipline.
12. **Fält has no provskott at all** (D.6.6) — unlike precision, and
    unlike magnumfält, whose first station is inskjutning (E.6.1). Do not
    generalise the sighter rules to fält.
13. **Fält resolves top ties with särskjutning, never with a final.**
    Särskjutning stations continue the station numbering (station 11, 12,
    …) and are mandatory for all medals at SM/landsdels-/kretsmästerskap
    (D.6.11.2.1.3, D.6.11.3). Whether they enter the recorded score is
    open — VERIFY.
14. **Fält vapengrupper are A, A optisk, B, C and R** (D.4, C.5.1.1.2);
    R exists here and not in precision. **Klass 3 in fält is qualified in
    fält only** (D.2.2) — a shooter's fält klass and precision klass are
    independent.
15. **Standardmedalj in fält is placement-only** — best 1/9 silver, best
    1/3 brons, rounded down (C.5.1.2/.2.1). There is no fixed-points
    path; that exists for precision only. Never compute a fält
    standardmedalj from a threshold table.
16. **Fältskyttemärket is a separate märke and is per competition, not
    per series** — three different competitions in one calendar year,
    thresholds by vapengrupp and station count (Bilaga 1 mom 5.7.1).
    Do not reuse guldserie logic for it.
17. **Magnumfältskjutning (Del E) is its own discipline**, with its own
    omfattning, its own M-vapengrupper and a standardmedalj rule that
    counts träff, träffade figurer _and_ poäng.

## Nationell helmatch (Del I) — figurskjutning is delmoment C

Facts: the "Del I — Nationell helmatch" section of the reference file.

18. **Three delmoment of 4 × 5 shots, 200 each, 600 total**: A precision
    (pistoltavla), B snabbskjutning (snabbskjutningstavla), C figurskjutning
    (figurtavla, 18/16/14/12 s). Each delmoment shoots its own face.
19. **Sighters before A and before B, never before C** (I.6.6.2).
20. **Tie-break is C, then B — never A**, then särskjutning in C (I.6.11.2).
21. **Standardmedalj is placement-only** (C.5.1.1.7, C.5.1.2): record the
    official medal, never compute one. No records, and the märke is out of
    scope.

Terminology: provskott/provserie = sighter · särskjutning = tie-break
(no sighters, out of v1) · guldserie = series meeting märke guld ·
vapengrupp = gun class · klass = shooter class · KM = klubbmästerskap ·
station = a fält round's 6-shot unit · figur = one target figure on a
station · poängmål/ringad figur = a ringed figure that also scores points ·
omskjutning = re-shoot after an approved vapenfel · tolk = plug gauge.
