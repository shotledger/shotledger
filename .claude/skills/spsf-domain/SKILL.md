---
name: spsf-domain
description: SPSF/ISSF target-shooting domain rules for ShotLedger — series/final/sighter structure, märke ("guldserie") and standardmedalj thresholds, vapengrupper and klasser, competition levels, target dimensions, licens/intyg rules. Use whenever implementing or reviewing scoring, session structure, compliance, discipline/program definitions, or any Swedish shooting-sport terminology.
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

Terminology: provskott/provserie = sighter · särskjutning = tie-break
(no sighters, out of v1) · guldserie = series meeting märke guld ·
vapengrupp = gun class · klass = shooter class · KM = klubbmästerskap.
