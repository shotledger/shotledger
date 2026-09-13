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

## Fältskjutning — kommandoord

D.6.2 p. 88 ("Kommandoord"), the range officer's command sequence.
Commands and their anvisning:

| Kommandoord                  | Anvisning                                           |
| ---------------------------- | --------------------------------------------------- |
| **LADDA!**                   | Ca 30 s före ALLA KLARA                             |
| **ALLA KLARA?**              | —                                                   |
| **10 SEKUNDER KVAR!**        | 10 sekunder före ELD                                |
| **FÄRDIGA!**                 | 3 sekunder före seriens början                      |
| **ELD!**                     | Skjuttiden börjar                                   |
| **ELD UPPHÖR!**              | Utdrages under 3 sek; kan ersättas med visselsignal |
| **PATRON UR! PROPPA VAPEN!** | Efter skjuttidens slut                              |
| **VISITATION!**              | —                                                   |
| **MARKERA!**                 | —                                                   |

Two consequences the fälttimer implements literally: "utdrages under 3
sek" means the ELD UPPHÖR call **begins** 3 s before the shooting time
runs out and ends exactly at its end — it is not a signal given after the
time; and LADDA's "ca 30 s" is the preparation countdown's default, not a
fixed value (the timer allows 10–90 s).

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
A 516 / R 528 / B 537 / C 540. No age adjustment on standardmedalj.
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
- Magnum (G.4.1 pp. 196–197): **M1**–**M9** (SA/DA magnum revolvers,
  frigrupp, service-pistol variants; SM only M1–M7 per C.3.6.2.3).

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

C.3.1 p. 52 — five levels: **Rikstävling**, **Nationell tävling**,
**Landsdelstävling**, **Kretstävling**, **Föreningstävling**.
**Mästerskap is a flag on a level**, not a level ("Mästerskapstävling
kan ingå i ovan angivna tävlingar") — KM = förening + mästerskap,
SM = riks + mästerskap.

## Targets

**Pistoltavla 25 m precision** (F.7.1 p. 182) — note: this is the
precision target; "C30"/"C25" are fältskjutning hit/miss circle figures
(30×27 / 25×22.5 cm, no rings, pp. 102–103):

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
