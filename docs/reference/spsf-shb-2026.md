# SPSF domain facts — Skjuthandboken 2026 (upplaga 21)

Verified extraction with section/page citations. One of three federation
reference files — see also [ISSF](issf-rules.md) and [SvSF](svsf-rules.md).

## Where to get the rule book

Skjuthandboken (SHB) is Svenska Pistolskytteförbundet's rule book, reissued
as a numbered upplaga. **Upplaga 21 applies from 1 January 2026.** Check for a
newer upplaga before citing this file.

| What                      | Link                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| SHB and SäkB landing page | <https://www.pistolskytteforbundet.se/om-pistolskytte/regler/skjuthandboken-och-sakb/> |
| **SHB 2026, upplaga 21**  | <https://www.pistolskytteforbundet.se/app/uploads/2026/01/SHB_2026_upplaga-21_NY.pdf>  |
| SäkB 2020 (säkerhet)      | <https://www.pistolskytteforbundet.se/app/uploads/2020/11/SäkB_2020.pdf>               |
| Tabell (klassfordringar)  | <https://www.pistolskytteforbundet.se/app/uploads/2022/05/Tabell-2022.pdf>             |

Source used below: `SHB_2026_upplaga-21_NY.pdf` (496 pp, kept outside the
repo). PDF page numbers equal printed page numbers. When SHB and this file
disagree, SHB wins — fix this file. Known erratum in the book: `F.6.1.1`
cross-references "C.6.1.1", which does not exist; the intended section is
`C.3.6.1.1`.

**Hitting a `VERIFY:`? Fetch the book first.** The PDF above is public and
downloadable at any time, so an unsourced value is a lookup before it is a
question for the maintainer — `curl -o /tmp/shb.pdf <the SHB link above>`,
then `pdftotext -layout -f <page> -l <page>`. Ask only about what the book
genuinely does not say. Keep the PDF outside the working tree.

## Precisionsskjutning

- Ordinary competition: **minst 6 serier om 5 skott** (F.6.1 p. 174;
  F.6.4 p. 175). 5 minutes per series (F.6.5); dispensation to 6 min
  possible at SM/landsdel level.
- Förberedelsetid 3 min — aiming/dry-firing allowed, loading forbidden
  (F.6.6.1).
- **One sighter series of 5 shots, 5 minutes**, before the competition
  (F.6.6.2 "Inskjutning").
- **Championship format** (C.3.6.1.1 p. 55): two rounds, 7 + 3 = 10
  series. Round 2 for the best 1/6 (rounded up) per vapengrupp; ties at
  the cut all advance; **the 10 best always advance**. **Each round has
  its own 5-shot sighter allowance** ("Före första och andra omgången
  medges fem provskott under en tid av fem minuter"). Result = sum of
  all ten series (round 1 carries over — not a reset final).
- **Standardmedalj at championships is computed on the grundomgång**
  (the 7-series round) only (C.5.1.1.4 p. 69).
- **Särskjutning** (tie-break; F.6.11.3 p. 181): extra series until
  medals decided; a shooter scoring below the round's best drops out;
  **no provskott**. Tie-break order before särskjutning: X count, then
  last series score backwards, then value counts in the last series
  (F.6.11.2.1 p. 180).
- Scoring rule (F.6.10.1 p. 176): "Kulhål räknas till det högre värdet
  så snart ringens ytterkant är tangerad."

## Militär snabbmatch

J.6.1 p. 290: **3 omgångar × 4 serier × 5 skott** (60 scored shots, max
600). Times per series: omgång 1 = 10 s, omgång 2 = 8 s, omgång 3 = 6 s.
Preceded by **one provserie of 5 shots at 10 s** (J.6.6.2). Vapengrupper
A, B, C, R. Ready position arm 45° lowered (J.6.3.1); max 2 malfunctions
(1 for R) (J.6.8.1).

- Scoring rule identical to precision (J.6.10.1 p. 293): "Kulhål räknas
  till det högre värdet så snart ringens ytterkant är tangerad."

## Magnumprecision

Del G, pp. 191–214. **Its own chapter, not precision at another distance** —
Part G repeats the whole structure (klasser, vapengrupper, genomförande,
mål) rather than deferring to Del F, and it differs from precision in three
places that matter to the app: the distance, the klassindelning and the
standardmedalj table.

- **What it is** (G.1.1 p. 192): "skjutning på bana med grovkalibriga vapen
  mot pistoltavla på **50 m** avstånd".
- **Tävlingsformer** (G.1.2 p. 192): "Ej tillämpligt" — Part G defines no
  round/final format of its own. A tie is resolved by countback and then
  **särskjutning** (G.6.11.2.1 p. 204, G.6.11.3 p. 204), never by a final.
- **No klassindelning** (G.2.1 p. 193): "I magnumprecision tillämpas ingen
  klassindelning." A start is in a vapengrupp only. This is why
  `shooterClassesForDiscipline('spsf-magnumprecision')` is empty and the
  session form shows no klass picker for it.
- **Who may shoot** (G.2.2 p. 193): not before the calendar year the shooter
  turns **18**; Pistolskyttekortet is required for anything above a
  föreningstävling.
- **Vapengrupper M1–M9** (G.4.1–G.4.1.9 pp. 196–197): M1 SA revolver
  .41–.44 Magnum · M2 DA revolver .41–.44 Magnum · M3 SA revolver .357
  Magnum · M4 DA revolver .357 Magnum · M5 frigrupp pistol/revolver 9 mm–.455
  · M6 pistol 9 mm–.455 · M7 revolver .357–.44 Magnum, pipa ≤165 mm · M8
  revolver .38 Special/.38-40/.44-40/.44 Special/.45 ACP/.45 Colt · M9
  tjänstevapenpistol 9 mm–.45, pipa ≤153 mm, i övrigt enligt vapengrupp A.
  **SM runs M1–M7 only** (C.3.6.2.3 p. 56).
- **Omfattning** (G.6.1 p. 199): "i regel **minst sex (6) serier om fem (5)
  skott** vardera" — _minst_, so the series count is freeform exactly as in
  precision. Five shots per series is restated at G.6.4 p. 200.
- **Time** (G.6.5 p. 200, restated G.7.3 p. 206): **5 minutes per series**;
  dispensation to 6 min is possible at SM/landsdels level and, per krets
  decision, for a single competition. Förberedelsetid 3 min, no loading
  (G.6.6.1 p. 200).
- **Sighter** (G.6.6.2 p. 200, "Inskjutning"): **one series of five provskott
  within five minutes**, before the competition — the same shape as
  precision's F.6.6.2.
- **Target** (G.7.1 p. 205): "Magnumprecision genomförs mot **Pistoltavla
  25 m precision**", and Part G prints the same ring table as F.7.1 — X 25,
  10 50, 9 100, 8 150, 7 200, 6 250, 5 300, 4 350, 3 400, 2 450, 1 500 mm;
  black over rings 7–10 (200 mm); ring line 0.2–0.5 mm; min visible
  550×550 mm; ring 10 unnumbered. Shot at **50 m** (G.7.2 p. 206). The app
  therefore reuses the `spsf-pistol-25m-precision` face rather than adding a
  second one — the face is identical, only the firing distance differs.
- **Scoring rule** (G.6.10.1 p. 201), identical to precision and milsnabb:
  "Kulhål räknas till det högre värdet så snart ringens ytterkant är
  tangerad." Tolkning uses the Förbundet's fältskyttetolkar (G.6.10.4 p. 202).

**Standardmedalj.** Omfattning is "Magnumprecision 6 serier om vardera 5
skott" (C.5.1 p. 69); participants are counted **vapengruppsvis**
(C.5.1.1.5 p. 70); and the fixed-points path (C.5.1.2.4 p. 71) is:

| Vapengrupp | Silver | Brons |
| ---------- | ------ | ----- |
| M1–M4, M8  | 282    | 274   |
| M5         | 294    | 288   |
| M6–M7, M9  | 270    | 253   |

- **The thresholds apply at six series only.** C.5.1.2.4 prints one
  unlabelled pair per vapengrupp with no series-count column and no scaling
  rule, unlike precision's C.5.1.2.3, which tabulates 6/7/10 and scales from
  the ten-series row. The omfattning C.5.1 fixes is six series, and that is
  the only count the book gives a poänggräns for. A magnumprecision
  competition may run longer (G.6.1 p. 199: "i regel **minst** sex (6)
  serier"), but no standardmedalj limit exists for it. Precision's ÷10× rule
  does not carry over. Confirmed 2026-10-03 in a discussion the maintainer
  relayed. Limits for more series in magnum were raised there as a question
  for a future SHB edition, not as current rule.

**No märke.** The pistolskyttemärke precision series is 25 m against
Pistoltavla 25 m precision under the F.8 rules, with rows for vapengrupp A,
B and C only (Bilaga 1 mom 5.1.1.1 p. 452). There is no M row and no 50 m
variant, so **no magnumprecision series can be a guldserie**. The only magnum
mention in the märke chapter is the _årtalsmärke_ substitution (Bilaga 1 mom
5.1.2.4 p. 454: moment 1 shot under the magnumprecision rules but scored to
vapengrupp A's, or C's with optics), which is a v2+ concern and is not
implemented.

## Fältskjutning

Fältskjutning is "skjutning på korta tider mot i terrängen, på varierande
sätt, anordnade mål", shot in patruller, moving between stations on foot
(D.1.1 p. 76). SHB gives fält its own chapter — Del D — so its klasser,
vapengrupper and scoring are **not** precision's rules with a different
target. Everything below is SHB upplaga 21 unless marked `VERIFY:`.

### Omfattning — stations, shots, time, sighters

- **6–10 skjutstationer, six shots at each** (D.6.1 p. 88: "Fältskjutning
  består i regel av sex (6) till tio (10) skjutstationer. Vid varje
  skjutstation skjuts sex (6) skott"). The six is a rule, not a custom:
  D.6.4 p. 91 — "Vid fältskjutning **skall** antalet skott vara sex (6)
  vid varje station." The WebShooter cache's unanimous 6 corroborates
  this; it does not establish it.
- **No fixed time per series** — D.6.5 p. 91 is "Ej tillämpligt". Time is
  a per-station property the banläggare sets from figure size, distance
  and vapengrupp (D.10.6 p. 119). Floor at maximum distance: **A and R
  ≥2 s/skott, B ≥1,75 s/skott, C ≥1,5 s/skott** (D.10.6.2.1–3
  pp. 120–122), plus **1,5–2 s** for a 45° utgångsställning and **1,5–2 s**
  per omriktning between målgrupper. Mörkerfältskjutning adds 30 %.
  Timing runs from "Eld" to the end of the drawn-out "Eld upphör", or for
  moving targets from the figures appearing to their disappearing
  (D.10.6 p. 119).
- **No provskott and no inskjutning in fält.** D.6.6 p. 91
  ("Förberedelse, provskott/visning av mål") says only "Målen visas när
  skyttarna intagit sina platser". Contrast **magnumfält**, where E.6.1
  p. 135 explicitly gives the first station over to inskjutning. A fält
  session therefore has nothing analogous to precision's provserie.
- **Standardmedalj scope**: a fältskjutning must be **≥6 stations × 6
  shots** for the medal to be awarded (C.5.1 p. 69).
- **Mästerskap scope**: SM, landsdels- and kretsmästerskap in fält
  "skall omfatta **minst 48 skott**" (C.3.6.1.2 p. 55, pointed to from
  D.6.1.1 p. 88) — i.e. at least 8 stations of 6. SHB states the minimum
  in _shots_, not in stations.

### Resultatberäkning — how hits, figures and points are counted

- **Vanlig fältskjutning: the result is "antal träff i antal figurer".
  Poängfältskjutning: the result is a single points sum, where every hit
  figure gives one point and every hit gives one point** (D.6.11 p. 95,
  verbatim: "Vid tävling i vanlig fälskjutning skall resultatet anges i
  antalet träff i antalet figurer. Vid tävling i poängfältskjutning skall
  resultatet anges i poäng. Varje träffad figur ger en poäng och varje
  träff, en poäng."). Poängfält is therefore **hits + figures** over the
  same two numbers — which is what the cache's ranking analysis found.
- **A hit counts only in the printed målyta (tapeten); a hole tangenting
  its edge counts (kantskott); on a poängmål the hole takes the higher
  ring value as soon as the ring's outer edge is tangented; a ricochet is
  a miss** (D.6.10.1 p. 93). Doubtful cases are resolved with the
  Förbundet's fältskyttetolkar (D.6.10.4 p. 94, Tabell 1 — tolkmått per
  kaliber; oval holes max 11 mm for A/B/R, 7 mm for C, 14 mm for .44/.45,
  p. 95).
- **Marking convention**: the result is written per target as e.g.
  "2 + 2", meaning 4 träff i 2 figurer (D.6.10.2 p. 93).
- **Max (and any min) hits per figure is set by the banläggare in the
  station's förutsättningar** — not a fixed rule (D.10.3 p. 117). In
  **poängfält the eldfördelning is always free and six hits in one figure
  may be counted** (same section).
- Shots on the wrong tavla/figur are misses; surplus hits not of the
  shooter's making are resolved in the shooter's favour up to their own
  shot count (D.6.10.3 p. 93).
- Penalties that change a station's score: wrong skjutställning → **all
  hits on that station are deducted** (D.6.3.1 p. 89); visibly ignoring a
  45° utgångsställning → the shooter's **best hit** is deducted
  (D.6.3.2.1 p. 89); shots before "Eld" or after "Eld upphör" → as many
  of the shooter's best hits deducted as there were early/late shots, and
  a shot before "LADDA" or after "PATRON UR" is a disqualification
  (D.6.7.1 p. 91).

### Särskiljning (countback) and särskjutning (shoot-off)

**Vanlig räkning, individual** (D.6.11.2.1.1 p. 95), on equal hits:

1. most figures hit;
2. highest points in any ringed figure(s) that the förutsättningar
   clearly designate as poängmål for särskiljning;
3. most hits on the last station, then the next-to-last, and so on.

**Poängfältskjutning, individual** (D.6.11.2.1.2 p. 96), on equal points
(= hits + figures hit):

1. highest points in the ringed figure designated as poängmål;
2. highest points (hits + figures) on the last station, then the
   next-to-last, and so on.

If that still does not separate them, either **särskjutning** is shot
until it does, or — where a shoot-off cannot or should not happen —
**lottning**. Särskjutning is normally applied **only for the medal
places**; lottning thereafter only distributes hederspriser, and shooters
who cannot be separated **share the same placement**
(D.6.11.2.1.1–2 pp. 95–96). Team tie-breaks: D.6.11.2.2 p. 96. A combined
fält + snabb + precision competition separates first on the fält
placement (D.6.11.2.3 p. 96).

> Discrepancy worth knowing: SHB mandates a last-station countback, but
> the cache's 257 fully-tied adjacent pairs showed no countback signal.
> Consistent with shared placements being published as consecutive
> numbers — but that is an inference from data, not a rule.

**Särskjutning** (D.6.11.3 p. 97):

- At **SM, landsdels- and kretsmästerskap**, a tie on the highest number
  of hits (or of points in poängfält) means särskjutning **for all
  medals** — "skall … äga rum" (D.6.11.2.1.3 p. 96). At a
  föreningsmästerskap it "bör" happen.
- It runs in as many omgångar as needed, **each omgång comprising one or
  more skjutstationer as the arrangör decides**, until the medallists are
  determined.
- A shooter who reaches **fewer hits than the round's best drops out**,
  provided enough shooters remain to decide the medals.
- With **more than three** participants, the särskjutning also fixes the
  order _behind_ the medallists, and the ordinary särskiljning rules
  apply among those still tied.
- **Numbering: the first 6-shot series of a särskjutning counts as
  station 11** when the competition had 10 stations, the next as station
  12, and so on — särskjutning stations continue the station sequence.
- If nobody can be separated and every shooter takes 6 hits, the arrangör
  may depart from D.10.6's distance and time rules as far as needed,
  keeping the rest of the station design within SHB.
- For the omskjutning allowance, **"Särskjutning räknas som ny start"**
  (D.6.8.1 p. 92).
- Worked examples — including a ringed-target särskjutning against 4
  ringade C 20, and a two-stations-per-omgång case — are at pp. 97–98.

### Omskjutning and vapenfel

- **One (1) omskjutning per start for vapenfel** (D.6.8.1 p. 92: "Skytt
  äger rätt till 1 omskjutning per start på grund av vapenfel.
  Särskjutning räknas som ny start."). This is **not** graded by
  vapengrupp, unlike milsnabb's J.6.8.1 — see `VERIFY:` below.
- Qualifying causes are enumerated (D.6.8 p. 92): visible feed/ejection
  fault, a klickad patron in the chamber, fewer than 6 rounds in a
  correctly inserted magazine, failure to fire on test with the slide
  fully forward and the weapon unsafed, or a revolver hammer forward on a
  klickad patron aligned with the barrel. A shot the shooter spoils
  themselves, or does not get away in time, gives no re-shoot. Clearing a
  stoppage within the shooting time consumes the right to an omskjutning
  on that station. An approved omskjutning is noted on the back of the
  skjutkort and the station's result ringed on the front.
- **A faulty target or målspel, or a funktionär's error, triggers
  omskjutning of the station for every affected shooter** — the
  stationschef decides (D.6.9 p. 92). This, not any "scratched station"
  rule, is what SHB Del D provides for a station that goes wrong.

### Vapengrupper and klasser in fält

| Klass         | Benämning          | Vapengrupper |
| ------------- | ------------------ | ------------ |
| 1 / 2 / 3     | Klass 1/2/3        | A, B, C, R   |
| Jun           | Juniorklass        | C            |
| Dam 1 / 2 / 3 | Damklass           | C            |
| Vet Y         | Veteranklass Yngre | C            |
| Vet Ä         | Veteranklass Äldre | C            |

(D.2.1 p. 77.) **R is in fält**, unlike precision.

Vapengrupp definitions for fält live in **D.4 pp. 82–86**: the common
limits (max 1400 g, 2000 g with optic; visirlinje ≤220 mm; box
300×150×50 mm) at D.4 p. 82; **A** D.4.1 p. 82 (7,6–11,4 mm, pipa
≤153 mm) with sub-groups **AM** (D.4.1.1 p. 84, pre-1945 military),
**AP** (D.4.1.2 p. 84, Walther PP/PPK 7,65), **AG** (D.4.1.3 p. 84,
Glock 17/19/43/45 fixed sights) and plain **A** (D.4.1.4 p. 84);
**B** D.4.2 p. 84 (≤600 J, avtryck ≥1000 g; A-vapen and revolvers may be
used in B); **C** D.4.3 p. 85 (.22 LR only, avtryck ≥1000 g);
**R** D.4.4 p. 86 (grovkalibrig revolver, pipa ≤153 mm excl. trumman,
165 mm for .44/.45, avtryck ≥1360 g, ≤600 J); **A optiska riktmedel**
D.4.5 p. 86 (as A, but ≤2000 g with the optic mounted; dimensions
measured without it).

**The vapengrupp set for fält is A, A optisk, B, C and R** — stated
independently at C.5.1.1.2 p. 69, where standardmedalj is computed
"vapengruppsvis (A, A optisk, B, C och R)". SHB defines no optics variant
of R.

**Klass 3 in fält is qualified in fält only** (D.2.2 p. 77: "För
uppflyttning till och kvarstående i klass 3 gäller kvalificering endast i
fältskjutning") — a separate qualification from precision's klass 3,
which F.2 qualifies precision-only. That is the rule behind WebShooter
keeping `grade_field` apart from `grade_trackshooting`. Fält klass 3
requirements: D.2.7 p. 79 (standardmedaljer earned **in fältskjutning**).
Klass 1 sub-grades 1u/1b/1s: D.2.5 p. 78. Klass 2: D.2.6 p. 79.

The one-start-per-competition rule in vapengrupp C, and the mästerskap
exception, exist in fält with the same wording as precision but scoped to
fältskjutningar (D.2.2 p. 77). Jun/Dam/Vet participation is voluntary and
they may instead enter open klass 1/2/3 in **A, B, C or R** (D.2.2 p. 77;
D.2.8–D.2.10 pp. 79–80). Class merging under five entrants: D.2.3 p. 78.
Handicap by differing distances, times, or a restricted scoring area:
D.2.4 p. 78. Vet Ä may use stödhand (D.6.3.3 p. 90); anyone turning 70
may in A, B and R (D.6.3.4 p. 90). SM qualification for fält: D.3 p. 81.

**Magnumfältskjutning is a separate discipline** (Del E, from p. 127),
not a fält variant: **≥8 stations, and ≥8 at SM**; the first station must
allow inskjutning and may not carry poängmål; **at least two stations
must have ringade figurer where both hits and points are counted**
(E.6.1 p. 135). SM is shot in **M1–M7** (C.3.6.2.3 p. 55). Its
standardmedalj compares "antal träff, träffade figurer **och** poäng"
(C.5.1.2.2 p. 70) — a different rule from plain fält's.

### Standardmedalj in fält

**Placement only — fält has no fixed-points path.** Silver goes to the
best ninth and brons to the best third of the shooters in the group,
rounded **down**, plus everyone with the same result (C.5.1.2 p. 70). The
"same result" is **the same number of hits** in vanlig fält and **the same
number of points** in poängfält (C.5.1.2.1 p. 70). The fixed poängkrav
table exists for precision (C.5.1.2.3 p. 71) and has no fält counterpart.

Grouping: all entrants together regardless of klass, **per vapengrupp
(A, A optisk, B, C, R)**, except at SM and landsdelsmästerskap where
vapengrupp C is computed separately per mästerskap (Öppen C, Dam C,
Vet Y C, Vet Ä C) (C.5.1.1.1–2 p. 69). Minimum competition size for the
medal: 6 stations × 6 shots (C.5.1 p. 69). A föreningstävling may award it
once per discipline per year, and such medals do not count towards
märkesprov, riksmästarklass or SM (C.5.1 p. 69).

### Fältskyttemärket (Bilaga 1 mom 5.7, pp. 462–463)

A **separate märke from the pistolskyttemärke**, and unlike the precision
märke it is **not a per-series threshold** — it is a whole competition's
result, achieved at **three different competitions in the same calendar
year** (mom 5.7.1 p. 462). Entry conditions: the shooter must have met the
**bronze pistolskyttemärke** requirement in the preceding calendar year
and be at least 15. Only one valör per year, and only the next valör up.
Prov may be taken at riks-, nationella, landsdels- and kretstävlingar in
fältskjutning.

Required hits — or, for poängfält, percentage of the maximum points sum:

**Vapengrupp A** (mom 5.7.1 p. 462)

| Märke  | 6 stn (36 tr) | 7 stn (42) | 8 stn (48) | 9 stn (54) | 10 stn (60) | Poäng % |
| ------ | ------------- | ---------- | ---------- | ---------- | ----------- | ------- |
| Brons  | 19            | 22         | 25         | 29         | 32          | 52      |
| Silver | 23            | 27         | 31         | 36         | 40          | 65      |
| Guld   | 27            | 31         | 36         | 41         | 46          | 75      |

**Vapengrupp B and C** (mom 5.7.1 p. 462)

| Märke  | 6 stn (36 tr) | 7 stn (42) | 8 stn (48) | 9 stn (54) | 10 stn (60) | Poäng % |
| ------ | ------------- | ---------- | ---------- | ---------- | ----------- | ------- |
| Brons  | 22            | 25         | 29         | 32         | 36          | 60      |
| Silver | 27            | 31         | 36         | 40         | 45          | 75      |
| Guld   | 31            | 36         | 41         | 46         | 51          | 86      |

**Vapengrupp R** (mom 5.7.1 p. 463)

| Märke  | 6 stn (36 tr) | 7 stn (42) | 8 stn (48) | 9 stn (54) | 10 stn (60) | Poäng % |
| ------ | ------------- | ---------- | ---------- | ---------- | ----------- | ------- |
| Brons  | 20            | 23         | 27         | 30         | 34          | 56      |
| Silver | 25            | 29         | 34         | 38         | 42          | 70      |
| Guld   | 29            | 34         | 38         | 44         | 49          | 80      |

Note the table's own station range — **6 to 10** — matching D.6.1.
Årtalsmärken (guld with stars, kvistar …): mom 5.7.2 p. 463. No
"A optisk" row exists in these tables; see `VERIFY:`.

### Fältskyttefigurer — the full figure catalogue (D.7.1 pp. 99–109)

General rules (D.7.1 p. 99): printed figure tapet on papp, printed
directly on papp, or cut from metal; **human-like targets of
non-military, commercial or home manufacture are forbidden**; ≥10 mm papp
outside the figure; hits count **across the whole tapet** (between a
rapporthund's legs, between a parachutist's lines, in a wheel hub); metal
targets are allowed if they fall on hit (fallmål); at mästerskap only
Förbundet-approved målmateriel may be used; unlisted figures need
kretsstyrelse approval and must be slotted into a suitable
figurgruppstorlek. Spacing within a målgrupp (Diagram 5 p. 99):
**mellan fig (cm) = (skjutavstånd (m) − 5) / 2, min 5 cm, max 40 cm**.

Distance modifiers (D.10.6.1 p. 119): **with stödhand**, use a figure one
group higher or move one step further out; **mörkerfältskjutning**, one
group lower (larger figure) or one step closer; diagonally placed S- and
L-targets move to a higher group number than their horizontal twin.

Max skjutavstånd in metres, standing **without stödhand** (pp. 100–109):

| Grupp | Figur              | Mått (cm)        | Anteckning                                         | A & R | B   | C   |
| ----- | ------------------ | ---------------- | -------------------------------------------------- | ----- | --- | --- |
| 0     | Fiktiv grupp       | —                | for computing grupp 1's max distance with stödhand | 80    | 90  | 100 |
| 1     | B 100              | 55×100           | militär 1/1                                        | 70    | 80  | 90  |
| 2     | B 65               | 50×65            | hits also between the parachute lines; militär 1/2 | 60    | 65  | 75  |
| 3     | C 50               | 50×45            |                                                    | 50    | 55  | 65  |
| 3     | Bildäck, bakifrån  | 42×61            | hit area also between the tyres                    | 50    | 55  | 65  |
| 3     | PPC-tavla          | 42×62            | no hit in the arrow                                | 50    | 55  | 65  |
| 4     | 1/3.               | 52×48            | militär 1/3                                        | 45    | 50  | 55  |
| 4     | Sexkant 3          | 44×63            |                                                    | 45    | 50  | 55  |
| 4     | Tunnan             | 40×50            |                                                    | 45    | 50  | 55  |
| 5     | B 45               | 35×45            |                                                    | 40    | 45  | 50  |
| 5     | C 40               | 40×36            |                                                    | 40    | 45  | 50  |
| 5     | Kvadraten 3        | 42×42            |                                                    | 40    | 45  | 50  |
| 5     | L3                 | 43×100           | vertikal                                           | 40    | 45  | 50  |
| 5     | Rubinen            | 37×50            |                                                    | 40    | 45  | 50  |
| 6     | C 35               | 35×31,5          |                                                    | 35    | 40  | 45  |
| 6     | L3                 | 43×100           | horisontal                                         | 35    | 40  | 45  |
| 6     | 1/4 rak            | 49×33            | militär 1/4                                        | 35    | 40  | 45  |
| 6     | 1/4 höger, vänster | 60×35            | militär 1/4 profil                                 | 35    | 40  | 45  |
| 6     | A-rondell 2        | Ø 33             |                                                    | 35    | 40  | 45  |
| 6     | Bildäck, sida      | 67×34            | hit area also in the rim                           | 35    | 40  | 45  |
| 6     | Sexkant 2          | 33×46            |                                                    | 35    | 40  | 45  |
| 7     | C 30               | 30×27            | militär 1/1 min                                    | 30    | 35  | 40  |
| 7     | L2                 | 30×70            | vertikal                                           | 30    | 35  | 40  |
| 7     | 1/1 miniatyr       | —                | SHB lists no mått                                  | 30    | 35  | 40  |
| 7     | S 25               | 25×62,5          | vertikal                                           | 30    | 35  | 40  |
| 7     | Rapporthund        | 25×68            | hits also between the legs                         | 30    | 35  | 40  |
| 8     | C 25               | 25×22,5          |                                                    | 27    | 32  | 36  |
| 8     | L2                 | 30×70            | horisontell                                        | 27    | 32  | 36  |
| 8     | S 20               | 20×50            | vertikal                                           | 27    | 32  | 36  |
| 8     | S 25               | 25×62,5          | horisontell                                        | 27    | 32  | 36  |
| 8     | 1/6 rak            | 45×26            | militär 1/6                                        | 27    | 32  | 36  |
| 8     | 1/6 höger, vänster | 45×26            | militär 1/6 profil                                 | 27    | 32  | 36  |
| 8     | A-triangel 2       | 39×29            |                                                    | 27    | 32  | 36  |
| 8     | B-triangel 2       | 28×26            |                                                    | 27    | 32  | 36  |
| 8     | A-oval 3           | 24×39            |                                                    | 27    | 32  | 36  |
| 8     | Sexkant 1          | 23×32            |                                                    | 27    | 32  | 36  |
| 9     | L1                 | 19×45            | vertikal                                           | 24    | 27  | 30  |
| 9     | S 20               | 20×50            | horisontell                                        | 24    | 27  | 30  |
| 9     | 1/7.               | 20×26            | huvud                                              | 24    | 27  | 30  |
| 9     | 1/8.               | 37×21            | militär 1/8                                        | 24    | 27  | 30  |
| 9     | A-rondell 1        | Ø 22             |                                                    | 24    | 27  | 30  |
| 9     | A-oval 2           | 19×26            |                                                    | 24    | 27  | 30  |
| 9     | B-rondell 3        | Ø 21             |                                                    | 24    | 27  | 30  |
| 9     | Diamanten          | 29,5×21          |                                                    | 24    | 27  | 30  |
| 9     | Ovalen nr 3        | 23,7×47          |                                                    | 24    | 27  | 30  |
| 10    | C 20               | 20×18            |                                                    | 20    | 22  | 25  |
| 10    | L1                 | 19×45            | horisontell                                        | 20    | 22  | 25  |
| 10    | B-oval 2           | 18×44            |                                                    | 20    | 22  | 25  |
| 10    | B-rondell 2        | Ø 18             |                                                    | 20    | 22  | 25  |
| 10    | Canaxa ovalen      | 28×17            | vertikal                                           | 20    | 22  | 25  |
| 10    | Ovalen nr 2        | 30×15            | vertikal                                           | 20    | 22  | 25  |
| 11    | S 15 D             | 15×37,5          |                                                    | 16    | 18  | 20  |
| 11    | Tunna D            | 16×20            |                                                    | 16    | 18  | 20  |
| 11    | Bunkerspringa      | 49×13            | vertikal                                           | 16    | 18  | 20  |
| 11    | B-triangel 1       | 22×20            |                                                    | 16    | 18  | 20  |
| 11    | Canaxa ovalen      | 28×17            | horisontell                                        | 16    | 18  | 20  |
| 11    | Flaskmål           | 14×39            | vertikal                                           | 16    | 18  | 20  |
| 11    | Kvadraten nr 2     | 23×23            |                                                    | 16    | 18  | 20  |
| 11    | Ovalen nr 2        | 30×15            | horisontell                                        | 16    | 18  | 20  |
| 12    | C 15 D             | 15×13,5          |                                                    | 14    | 16  | 18  |
| 12    | Kvadraten 1        | 17×17            |                                                    | 14    | 16  | 18  |
| 12    | A-triangel 1       | 23×21            |                                                    | 14    | 16  | 18  |
| 12    | A-oval 1           | 14×20            |                                                    | 14    | 16  | 18  |
| 12    | B-oval 1           | 14,5×29          | horisontell                                        | 14    | 16  | 18  |
| 12    | Ovalen nr 1        | 10,4×20          | vertikal                                           | 14    | 16  | 18  |
| 12    | Bunkerspringa      | 49×13            | horisontell                                        | 14    | 16  | 18  |
| 12    | Flaskmål           | 14×39            | horisontell                                        | 14    | 16  | 18  |
| 12    | S 10 D             | 10×25            | vertikal                                           | 14    | 16  | 18  |
| 13    | S 10 D             | 25×10            | horisontell                                        | 12    | 14  | 16  |
| 13    | B-rondell 1        | Ø 12             |                                                    | 12    | 14  | 16  |
| 13    | Ovalen nr 1        | 20×10,4          | horisontell                                        | 12    | 14  | 16  |
| 13    | HJ snabbmål        | olika            |                                                    | 12    | 14  | 16  |
| 13    | Lurifaxen          | 18×27            | **not usable as a poängmål**                       | 12    | 14  | 16  |
| 13    | Stolpskottet       | 30×59, ring Ø 12 |                                                    | 12    | 14  | 16  |
| 13    | SWE-målen          | olika            |                                                    | 12    | 14  | 16  |
| 13    | Skidskyttemål      | Ø 11             |                                                    | 12    | 14  | 16  |
| —     | Helmatchtavla      | olika            | max distance set by the figure spacing             | 13    | 13  | 13  |
| 14    | Sköldmål           | 5,5×15,5         |                                                    | 7     | 8   | 9   |

### Kommandoord

D.6.2 p. 88 ("Kommandoord"), the range officer's command sequence.
Commands and their anvisning:

| Kommandoord                  | Anvisning                                           |
| ---------------------------- | --------------------------------------------------- |
| **LADDA!**                   | Ca 30 s före ALLA KLARA                             |
| **ALLA KLARA?**              | Om NEJ upprepa efter ca 10 s                        |
| **10 SEKUNDER KVAR!**        | 10 sekunder före ELD                                |
| **FÄRDIGA!**                 | 3 sekunder före seriens början                      |
| **ELD!**                     | Skjuttiden börjar (endast vid fasta mål)            |
| **ELD UPPHÖR!**              | Utdrages under 3 sek; kan ersättas med visselsignal |
| **PATRON UR! PROPPA VAPEN!** | Efter skjuttidens slut                              |
| **VISITATION!**              | —                                                   |
| **MARKERA!**                 | —                                                   |

Two consequences the fälttimer implements literally: "utdrages under 3
sek" means the ELD UPPHÖR call **begins** 3 s before the shooting time
runs out and ends exactly at its end — it is not a signal given after the
time; and LADDA's "ca 30 s" is the preparation countdown's default, not a
fixed value (the timer allows 10–90 s). With **moving targets there is no
ELD** — firing starts when the figures are shown and ends when they
disappear (D.6.2 p. 88). The shooting phase is formally under way from
"10 sekunder kvar" (D.6.7 p. 91).

Skjutställningar are stående, knästående, sittande and liggande, with or
without stödhand, or valfri (D.6.3 p. 89); liggande or knästående must be
announced in the inbjudan.

### `VERIFY:` — fält questions SHB upplaga 21 does not answer

None of these may be inferred from the WebShooter cache or from practice.

- `VERIFY:` **Poängmål / ringade figurer — the ring values.** SHB names
  poängmål and ringade figurer repeatedly for fält (D.6.10.1 p. 93,
  D.6.11.2.1.1–2 pp. 95–96, D.6.11.3 p. 97) but Del D defines **no ring
  scheme, no ring diameters and no valör range** for a fält figure. The
  only concrete numbers are Stolpskottet's ring Ø 12 cm (p. 109) and
  Lurifaxen being barred as a poängmål (p. 109). Where are a ringed fält
  figure's valörer defined, and is the arrangör free to choose them?
- `VERIFY:` **How many stations carry poängmål in plain fält.** Magnumfält
  requires at least two (E.6.1 p. 135); Del D states no minimum at all,
  only "eventuellt förekommande ringad(e) figur(er)". Is a plain-fält
  poängmål wholly at the arrangör's discretion?
- `VERIFY:` **Is "poängfältskjutning" chosen per competition, and must it
  be announced?** D.6.11 p. 95 and D.10.3 p. 117 describe it as a distinct
  tävlingsform with its own rules (free eldfördelning; six hits in one
  figure may count; both easy and hard figures on every station,
  D.10.4 p. 118) — but SHB does not say who decides, or when.
- `VERIFY:` **Does a särskjutning's result enter the recorded score, or
  only the placement?** D.6.11.3 p. 97 numbers särskjutning series as
  stations 11, 12 … yet describes them purely as deciding the medallists
  and the order behind them. Which number is "the result" — main round
  only, or main round plus särskjutning?
- `VERIFY:` **Does a särskjutning have a sighter?** SHB gives fält no
  provskott at all (D.6.6 p. 91) and says nothing special for
  särskjutning; confirm there is genuinely none.
- `VERIFY:` **Omskjutning count per vapengrupp.** D.6.8.1 p. 92 says
  flatly **1 per start**, with no vapengrupp split. Is the fält figure 1
  for every vapengrupp, or is there a source outside SHB Del D?
- `VERIFY:` **A station "deemed wrong" and scratched.** SHB Del D has no
  such concept: a faulty target, faulty målspel or funktionär error
  triggers **omskjutning of that station for the affected shooters**
  (D.6.9 p. 92), not annulment. Is scratching a station a real SHB
  instrument (and if so, where), a jury/tävlingsledning power under Del C,
  or a practice? And what makes a mästerskap invalid if it happens —
  C.3.6.1.2 p. 55's "minst 48 skott" is the only stated minimum, and it is
  expressed in shots.
- `VERIFY:` **`OptR` / an optics variant of vapengrupp R.** SHB fält has
  A, A optisk, B, C and R only (D.4 pp. 82–86; C.5.1.1.2 p. 69). Is
  `OptR` a sanctioned SPSF vapengrupp, a krets-level local class, or a
  WebShooter artefact?
- `VERIFY:` **Fältskyttemärket for vapengrupp A optisk.** The tables at
  mom 5.7.1 pp. 462–463 cover A, B/C and R only. Does an A-optisk shooter
  use the A row, or is the märke unavailable in that vapengrupp?
- `VERIFY:` **Whether a fält result's per-station breakdown is official.**
  SHB defines the result as a total ("antal träff i antal figurer",
  D.6.11 p. 95); the skjutkort carries per-station entries (D.6.8 p. 92,
  D.6.10.2 p. 93), but no section specifies the published per-station
  record. Official part of the result, or a WebShooter presentation
  choice?

## Pistolskyttemärke per-series thresholds ("guldserie")

Bilaga 1 mom 5.1.1.1 p. 452 — per 5-shot precision series, by
vapengrupp. (The word "guldserie" does not occur in SHB; colloquially it
means a series meeting the guld requirement.)

| Valör  | A   | B   | C   |
| ------ | --- | --- | --- |
| Brons  | 32  | 33  | 34  |
| Silver | 38  | 39  | 40  |
| Guld   | 43  | 45  | 46  |

Age reduction: **−1 p/series** from the year after turning 55;
**−2 p/series** from the year after turning 65.

**Practice series count.** A qualifying series does not have to be shot in
competition — training counts towards the märkesprov. Maintainer ruling,
2026-09-13, in answer to a direct question; no page citation was given, so this
is the one entry here sourced from the maintainer rather than from SHB. Upgrade
it to a citation if one turns up.

This is why `guldserieCount()` applies no session-type filter, and why a
training session must keep carrying a vapengrupp even if the form stops asking
for one (issue #117) — the märke reads the gun, not the klass.

## Standardmedalj

Two paths (C.5.1.2 pp. 70–71), mixable: (a) placement — silver to best
1/9, brons to best 1/3 (rounded down, ties included); (b) fixed points,
precision (C.5.1.2.3 p. 71):

| Serier | A/A-opt silver | A brons | B silver | B brons | C silver | C brons |
| ------ | -------------- | ------- | -------- | ------- | -------- | ------- |
| 6      | 277            | 267     | 282      | 273     | 283      | 276     |
| 7      | 323            | 312     | 329      | 319     | 330      | 322     |
| 10     | 461            | 445     | 470      | 455     | 471      | 460     |

More than 10 series: 10-series value ÷ 10 × series count. Milsnabb
(C.5.1.2.5, 12 series): silver A 540 / R 552 / B 561 / C 564; brons
A 516 / R 528 / B 537 / C 540. Magnumprecision (C.5.1.2.4, 6 series):
silver M1–M4/M8 282 / M5 294 / M6–M7/M9 270; brons 274 / 288 / 253 — see
[Magnumprecision](#magnumprecision) for the series-count caveat. No age
adjustment on standardmedalj.
Guld standardmedalj = 50 accumulated points (brons=1, silver=2;
C.5.2.1 p. 73); överstycke med krans at 100…3000 (C.5.2.2).
Föreningstävling medals: max once per discipline per year and do not
count toward märkesprov/riksmästarklass/SM qualification (C.5.1).

## Vapengrupper (the gun) — per discipline

- Precision (F.4 pp. 169–172): **A** (7.6–11.4 mm, 420–600 J, ≤1400 g,
  pipa ≤153 mm) with optional sub-groups **AM** (pre-1945 military),
  **AP** (Walther PP/PPK 7,65), **AG** (Glock 17/19/43/45 9×19 fixed
  sights); **A-opt** (A + optics, ≤2000 g with optic); **B** (grovkal.
  pistol/revolver ≤600 J); **C** (.22 LR only). **No R in precision**
  (F.4.4 "Ej tillämplig").
- Fält and milsnabb add **R** (grovkal. revolver; pipa ≤153 mm excl.
  cylinder, 165 mm for .44/.45; avtryck ≥1360 g) (D.4.4 p. 86, J.4).
  Fält's full set is **A, A optisk, B, C, R** and has its own chapter —
  see [Vapengrupper and klasser in fält](#vapengrupper-and-klasser-in-fält).
- Magnum (G.4.1 pp. 196–197): **M1**–**M9** (SA/DA magnum revolvers,
  frigrupp, service-pistol variants; SM only M1–M7 per C.3.6.2.3). They belong
  to magnumprecision — see [Magnumprecision](#magnumprecision).

## Klasser (the shooter)

F.2.1 p. 163: **1** (variants 1u nybörjare, 1b bronsskytt, 1s
silverskytt — F.2.5), **2**, **3** (riksmästarklass), **Jun** (≤ year
turning 20), **Dam 1/2/3**, **Vet Y** (year turning 60+), **Vet Ä**
(year turning 70+).

**Vapengrupper per klass (F.2.1 table, p. 163):** klass **1/2/3 → A, B, C**;
**Jun, Dam 1/2/3, Vet Y, Vet Ä → C only**. Confirmed in F.2.8/F.2.9/F.2.10
("I junior-/dam-/veteranklass tävlas med vapen kaliber .22, vapengrupp C").

**Klass is NOT per vapengrupp** (F.2.2 p. 163): "Skytt hänförs till viss klass
oavsett i vilken vapengrupp kompetensfordringarna uppfyllts." One klass applies
whichever gun is shot. Klass 3 qualification is precision-only.

**Jun/Dam/Vet may also enter the open classes** (F.2.2 p. 163): they may
"tävla i (öppen) klass 1, 2 eller 3 alltefter kompetens inom vapengrupperna
A, B, eller C". Entering dam-, junior- or veteranklass is explicitly
**voluntary** (F.2.8/F.2.9/F.2.10: "Att delta i … är frivilligt").

**One start per competition in vapengrupp C — with a championship exception**
(F.2.2 p. 163). The general rule: "i samma tävling inom vapengrupp C får
skytten endast starta i en klass i precisionsskjutningar (t.ex. start i klass
Vet Y och klass 3 C är inte tillåten)." The next bullet carves it open: "vid
SM, landsdels- eller kretsmästerskap får en arrangör medge start, förutom i
den egna klassen, **även i öppen klass**." Shooters do compete in C and
another class at SM. **Not a rule the app may enforce** — the arrangör
decides, and eligibility here is offered, never gated.

**Jun and Vet are not gender-split** (F.2.8, F.2.10 p. 167): "Herr- och
damjuniorer tävlar i samma klass"; "Veteranklass kan bestå av såväl herrar som
damer" — though F.2.3 p. 164 splits them again when a class has under five
entrants.
Vet Ä may use stödhand in precision (F.6.3.2); anyone turning 70 may in
A/B (F.6.3.3), and in A/B/R in milsnabb (J.6.3.3). Display convention:
"C 2" = vapengrupp C, klass 2 (F.2.6–F.2.7).

## Tävlingsnivåer

C.3.1 p. 52 — five levels. What separates them is **who sanctions the
competition and which shooters may enter**, not its size:

| Nivå                  | Sanction                                                                                      | Who may take part                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Rikstävling**       | Förbundet itself, or a krets/förening **på uppdrag av Förbundsstyrelsen**                     | deltagare **från hela riket** — as a tävling på hemortens banor or at one place (C.3.1.1)                                               |
| **Nationell tävling** | a krets or förening, **med Förbundets medgivande**                                            | shooters from **samtliga till Förbundet anslutna föreningar** (C.3.1.2)                                                                 |
| **Landsdelstävling**  | a krets/förening **på uppdrag av eller efter godkännande av Förbundsstyrelsen**               | shooters from **samtliga kretsar inom landsdelen** (C.3.1.3)                                                                            |
| **Kretstävling**      | a krets/förening within the krets, **på uppdrag av eller efter medgivande av kretsstyrelsen** | shooters from **samtliga föreningar inom kretsen**; föreningar from angränsande kretsar too if the kretsstyrelse so decides (C.3.1.4)   |
| **Föreningstävling**  | an affiliated förening                                                                        | its **egna medlemmar**, optionally also shooters from **annan förening (vissa andra föreningar)** in its own or another krets (C.3.1.5) |

All five at C.3.1–C.3.1.5 p. 52. The line between a föreningstävling and a
nationell tävling is therefore the sanction plus the invited set, not the
entry count: an open invitation still needs Förbundets medgivande to be
nationell, and a föreningstävling may invite named other clubs and remain a
föreningstävling — which is why the föreningstävling restrictions on
standardmedalj (C.5.1 p. 69) bite where they do.

**Mästerskap is a flag on a level**, not a level: "Mästerskapstävling kan
ingå i ovan angivna tävlingar" (C.3.1 p. 52) — KM = förening + mästerskap,
SM = riks + mästerskap.

## Targets

**Pistoltavla 25 m precision** (F.7.1 p. 182) — note: this is the
precision target; "C30"/"C25" are two of the ~70 fältskjutning hit/miss
figures (30×27 / 25×22,5 cm, no rings), catalogued in full under
[Fältskyttefigurer](#fältskyttefigurer--the-full-figure-catalogue-d71-pp-99109):

| Ring | Ø mm |     | Ring | Ø mm |
| ---- | ---- | --- | ---- | ---- |
| X    | 25   |     | 5    | 300  |
| 10   | 50   |     | 4    | 350  |
| 9    | 100  |     | 3    | 400  |
| 8    | 150  |     | 2    | 450  |
| 7    | 200  |     | 1    | 500  |
| 6    | 250  |     |      |      |

Black covers rings 7–10 (200 mm); ring line 0.2–0.5 mm; min visible
target 550×550 mm; ring 10 not numbered; distance 25 m (F.7.2).

**Snabbskjutningstavla 25 m** (milsnabb; J.7.1 p. 297): rings 5–10 only;
X = 50, 10 = 100, 9 = 180, 8 = 260, 7 = 340, 6 = 420, 5 = 500 mm; black
across 5–10; ring line 0.5–1.0 mm.

## Licens/intyg (SHB Bilaga 8, p. 484)

FAP 551-3 is **not** referenced in SHB (numeric activity counts come
from FAP/club PM, not this book). SHB's own club-intyg rules: ≥6 months
aktivt medlemskap ("regelbundet ha deltagit i föreningens tävlings- och
träningsverksamhet") before first intyg; first weapon .22; grovkaliber
earliest after 12 months; pistolskyttekort required; pistolskyttemärke
i guld — or årtalsmärke within the last two years — required (65+ may
intecken årtalsmärke at silver level, Bilaga 1 mom 5.1.2.2 p. 453);
intyg decided at styrelsesammanträde and sent directly to police.
