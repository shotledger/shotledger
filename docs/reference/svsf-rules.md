# SvSF domain facts — Svenska Skyttesportförbundet

Verified extraction with section citations. One of three federation reference
files — see also [SPSF](spsf-shb-2026.md) and [ISSF](issf-rules.md).

SvSF is the Swedish member federation of the ISSF, and the one the app means
by the `SvSF` regelverk (ADR 0011). It is **not** a synonym for ISSF: it
publishes Swedish translations of the ISSF chapters, which govern national
competitions, and adds a national layer ISSF has no concept of — a national
event list, national championship categories, one pistol discipline of its
own (snabbluftpistol), a hit-or-miss air pistol event (falling target), a
class system and a badge programme.

## Where to get the rule books

All of it hangs off two index pages, which are the right place to start every
lookup:

| What                                             | Link                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Reglementen (the federation-wide index page)** | <https://www.skyttesport.se/taevlingsverksamhet/reglementen/>                                      |
| **Pistol — grenspecifika regler (index page)**   | <https://www.skyttesport.se/vaara-idrottsgrenar/pistol/taevlingsverksamhet/regler-grenspecifika/>  |
| Pistol — våra grenar och discipliner (overview)  | <https://www.skyttesport.se/vaara-idrottsgrenar/pistol/vaara-grenar-och-discipliner/>              |
| SvSF allmänna bestämmelser (2026-03-13)          | <https://www.skyttesport.se/media/farftxti/105-allmaenna-bestaemmelser-2026-03-13.pdf>             |
| ISSF kap. 6 — allmänna tekniska (sv)             | <https://www.skyttesport.se/media/1eof5lm4/issf-reglemente-6-kap-allmaenna-tekniska-juli-2026.pdf> |
| ISSF kap. 7 — gevär (sv)                         | <https://www.skyttesport.se/media/kzypfdze/issf-reglemente-7-kap-gevaer-2026-07.pdf>               |
| **ISSF kap. 8 — pistol (sv)**                    | <https://www.skyttesport.se/media/tswn5nx3/issf-reglemente-8-kap-pistol-juli-2026.pdf>             |
| **Tävlings-PM Pistol** (2025-01-01, rev. 01-29)  | <https://www.skyttesport.se/media/oiwllhk0/svsf_tavlings_pm_pistol_2025_reviderat_250129.pdf>      |
| **Godkända SM- och DM-grenar** (2023-03-30)      | <https://www.skyttesport.se/media/f40jguzr/rf-godkanda-sm-grenar-mars-2023.pdf>                    |
| **Reglemente 10 m Snabbluftpistol** (jan 2026)   | <https://www.skyttesport.se/media/szdgivtt/svsf-reglemente-snabbluftpistol-2026.pdf>               |
| Reglemente 10 m Falling target (aug 2025)        | <https://www.skyttesport.se/media/dbulhc1m/svsf-reglemente-falling-target-2025.pdf>                |
| Regler 25 m standardpistol, mixade lag           | <https://www.skyttesport.se/media/wpmdnavg/regler-25m-standardpistol-mixade-lag.pdf>               |
| Regler 50 m pistol, mixade lag                   | <https://www.skyttesport.se/media/zwmbmnm0/regler-50m-pistol-mixade-lag.pdf>                       |
| Klargörande mixade lag (FS 2020-01-21)           | <https://www.skyttesport.se/media/nlhieoms/klargorande_mixade_lag_200121-1.pdf>                    |
| Reglemente för lag-SM 10 m (2018-02-01)          | <https://www.skyttesport.se/media/yo1mdlcv/reglemente_for_lag_sm_10m_20180201.pdf>                 |
| Skyttemärken SvSF (2023-01-12)                   | <https://www.skyttesport.se/media/ovfjszky/skyttemaerken-svsf.pdf>                                 |
| SvSF stadgar                                     | <https://www.skyttesport.se/media/ixxb0002/stadgar-svsf-2025-04-13.pdf>                            |

The media paths carry an opaque id that changes when a document is reissued,
so a dead link means "re-read the index page", not "the document is gone".

Sources used below: the allmänna bestämmelser, fetched 2026-09-12; every
other document in the table, fetched 2026-09-16. When a source and this file
disagree, the source wins — fix this file.

## Rule precedence for national pistol competitions (Tävlings-PM §1)

The Tävlings-PM says in which order the rules apply "för nationella
pistoltävlingar":

1. SvSF stadgar
2. SvSF allmänna bestämmelser
3. Tävlings-PM Pistol itself
4. "Särskilda förfaranden enligt procedurer, lathundar mm"
5. ISSF reglemente kap. 8 Pistol, Swedish translation with national additions
6. ISSF reglemente kap. 6 allmänt, Swedish translation with national additions

So where the Tävlings-PM and the allmänna bestämmelser disagree, the
bestämmelser win — which matters for the junior age below. The same order,
with the lag-SM reglemente inserted at 3, is restated in Reglemente för
lag-SM 10 m §2.

## Juniors: two different ages (1.5)

SvSF uses the ISSF age for ISSF events and the SPSF-like age for everything
else. Both are year-based, so a birth year remains enough:

- **1.5.1** — ISSF grenar plus nordisk trap: _"Juniorer är de som fyller
  högst 21 år det år tävlingen äger rum."_
- **1.5.2** — Övriga grenar: _"Juniorer är de som fyller högst 20 år det år
  tävlingen äger rum."_

Encoded as `juniorMaxAge` on every event (`shared/src/disciplines/entries.ts`):
`ISSF_JUNIOR_MAX_AGE = 21` on every event whose discipline is an ISSF gren —
ISSF's own events and the SvSF categories on ISSF grenar alike — and
`SVSF_NATIONAL_JUNIOR_MAX_AGE = 20` on `svsf-snabbluftpistol`, which is not an
ISSF gren (its reglemente §1 calls it "ett svenskt specialreglemente"). The two
cannot share one constant.

**VERIFY (maintainer):** Tävlings-PM 14.1 divides juniors "för hederspriser"
into _herrjunior/damjunior äldre_ ("de som under året fyller 19–21 år") and
_yngre_ ("högst 18 år"). Its 21 agrees with 1.5.1 for ISSF grenar, but 14.1
is written for all pistol grenar and does not say 20 for snabbluftpistol. The
PM is subordinate to the allmänna bestämmelser (PM §1), so the app encodes
1.5.1/1.5.2 as written; whether SvSF in practice runs snabbluftpistol juniors
to 21 is a question for the federation, not something to guess.

## Championship categories (2.6)

The SM programme is where SvSF's national layer shows up as categories:

| SM form       | Who may enter                                   | Section |
| ------------- | ----------------------------------------------- | ------- |
| SM herrar     | Herrar; **herrjunior får delta**                | 2.6.2.1 |
| SM damer      | Damer; **damjunior får delta**                  | 2.6.3.1 |
| SM herrjunior | Herrjuniorer                                    | 2.6.4.1 |
| SM damjunior  | Damjuniorer                                     | 2.6.5.1 |
| Junior-SM     | Both dam- and herrjunior, in one class          | 2.6.6.1 |
| **Öppna SM**  | Herrar, damer, herrjuniorer **and** damjuniorer | 2.6.7.1 |

Two things follow for the model:

- **A junior entering the senior event is the norm, not an exception** (2.6.2.1
  and 2.6.3.1). That is the same shape as `rankEventsForShooter` — rank, do not
  gate — and 7.1.7 confirms the intent: _"Inom ISSF:s grenar kan juniorer slå
  juniorrekord vid deltagande i seniorklass."_
- **Öppna SM and Junior-SM are genuinely open categories**, run when the field
  is too small for separate ones (2.6.6.2, 2.6.7.1). They map onto
  `EntryCategory` as `{ gender: 'open', age: 'open' }` and
  `{ gender: 'open', age: 'junior' }` — categories ISSF's own event list has
  no row for. Which grenar they run in comes from the SM/DM list and
  Tävlings-PM 15.1, transcribed next.

2.1.1: SM and DM "får arrangeras i grenar och klasser enligt gällande lista på
SvSF:s hemsida" — that list is the RF-godkända one below. 2.1.2: a
championship may be individual or for teams "sammansatt av medlemmar i samma
förening". Section 5.2.1 leaves further class division inside
herrar/damer/juniorer — prestationsklasser, åldersklasser, öppen klass — to
each idrottskommitté; for pistol that is Tävlings-PM 14, below.

## Godkända SM- och DM-grenar — pistol rows (RF list, 2023-03-30)

The list has three column groups — _Herrgrenar_, _Damgrenar_, _Öppna grenar_ —
each with SM ind/lag and DM ind/lag. `x3`/`x2` is the team size. The 60-shot
pistol rows, transcribed:

| Gren                          | Klass  | Herr      | Dam         | Öppna     | Note                 |
| ----------------------------- | ------ | --------- | ----------- | --------- | -------------------- |
| Fripistol 50 m 60 skott       | —      |           |             | SM/DM, x3 | VM-gren              |
| Fripistol 50 m 60 skott       | junior |           |             | SM/DM, x2 |                      |
| Grovpistol 25 m 60 skott      | —      |           |             | SM/DM, x3 | VM-gren              |
| Snabbpistol 25 m 60 skott     | —      |           |             | SM/DM, x3 | OS- och VM-gren      |
| Snabbpistol 25 m 60 skott     | junior |           |             | SM/DM, x2 |                      |
| Sportpistol 25 m 60 skott     | —      | SM/DM, x3 |             |           |                      |
| Sportpistol 25 m 60 skott     | h-jun  | SM/DM, x2 |             |           |                      |
| Sportpistol 25 m 60 skott     | dam    |           | SM/DM, x3   |           | OS- och VM-gren      |
| Sportpistol 25 m 60 skott     | d-jun  |           | SM/DM, x2   |           |                      |
| Standardpistol 25 m 60 skott  | —      | SM/DM, x3 |             |           | VM-gren              |
| Standardpistol 25 m 60 skott  | junior |           |             | SM/DM, x2 |                      |
| Standardpistol 25 m 60 skott  | dam    |           | SM/DM, x3   |           |                      |
| Luftpistol 10 m 60 skott      | —      | SM/DM, x3 |             |           | OS- och VM-gren      |
| Luftpistol 10 m 60 skott      | h-jun  | SM/DM, x2 |             |           |                      |
| Luftpistol 10 m 60 skott      | dam    |           | SM/DM, x3   |           | OS- och VM-gren      |
| Luftpistol 10 m 60 skott      | d-jun  |           | SM/DM, x2   |           |                      |
| Snabbluftpistol 10 m 60 skott | —      |           |             | SM/DM, x3 |                      |
| Snabbluftpistol 10 m 60 skott | junior |           |             | SM/DM, x2 |                      |
| Falling target lp 10 m 25 sk. | —      | SM/DM, x3 |             |           | Grundomgång 25 skott |
| Falling target lp 10 m 25 sk. | junior | SM/DM, x2 |             |           | Grundomgång 25 skott |
| Falling target lp 10 m 25 sk. | dam    |           | SM/DM, x3/2 |           | Grundomgång 25 skott |
| Falling target lp 10 m 25 sk. | d-jun  |           | SM/DM, x2   |           | Grundomgång 25 skott |

The list's own caveat: _"RF-godkännande krävs för att få genomföra SM/DM i
resp. klass enligt respektive grenreglemente."_ Tävlings-PM 15.1 (next) is
the pistol committee's reading of the same list and agrees with it row for
row.

## Tävlings-PM 15 — mästerskap

15: championships are SM, Riksmästerskap (RM), Regionsmästerskap (RegM) and
Distriktsmästerskap (DM); clubs are urged to run KM in every gren. Below the
table: SM/DM status is decided by Riksidrottsförbundet on SvSF's proposal,
RegM status by SvSF's Förbundsstyrelse; _"Veteranklasser har inte SM-status
hos RF"_.

### 15.1 Mästerskapsklasser (pistol table, individual rows)

| Gren            | Klass                          | SM  | RM  | RegM | DM  | Hederspris | Note               |
| --------------- | ------------------------------ | --- | --- | ---- | --- | ---------- | ------------------ |
| Luftpistol      | Herr                           | x   |     | x    | x   | 1, 2, 3    |                    |
| Luftpistol      | Dam                            | x   |     | x    | x   | 1, 2, 3    |                    |
| Luftpistol      | Herrjunior                     | x   |     | x    | x   | Ä och Y    |                    |
| Luftpistol      | Damjunior                      | x   |     | x    | x   | Ä och Y    |                    |
| Luftpistol      | Veteraner                      |     | x   | x    |     |            |                    |
| Luftpistol      | Stödhandsklasser               |     |     | x    |     |            |                    |
| Luftpistol      | Lp 11 / 13 / 13 STÅ / 16 P & F |     | x   |      |     |            | one row each       |
| Falling target  | Herr                           | x   |     | x    | x   | 1, 2, 3    |                    |
| Falling target  | Dam                            | x   |     | x    | x   | 1, 2, 3    |                    |
| Falling target  | Herrjunior                     | x   |     | x    | x   | Ä och Y    |                    |
| Falling target  | Damjunior                      | x   |     | x    | x   | Ä och Y    |                    |
| Snabbluftpistol | Senior (öppen)                 | x   |     | x    | x   |            |                    |
| Snabbluftpistol | Junior (öppen)                 | x   |     | x    | x   |            |                    |
| Sportpistol     | Herr                           | x   |     | x    | x   | 1, 2, 3    |                    |
| Sportpistol     | Dam                            | x   |     | x    | x   | 1, 2, 3    |                    |
| Sportpistol     | Herrjunior                     | x   |     | x    | x   | Ä o Y      |                    |
| Sportpistol     | Damjunior                      | x   |     | x    | x   | Ä o Y      |                    |
| Sportpistol     | Veteraner                      |     | x   | x    |     |            |                    |
| Sportpistol     | Stödhandsklasser               |     |     | x    |     |            |                    |
| Grovpistol      | Senior (öppen)                 | x   |     | x    | x   | 1, 2, 3    |                    |
| Grovpistol      | Veteraner                      |     | x   | x    |     |            |                    |
| Grovpistol      | Stödhandsklasser               |     |     | x    |     |            |                    |
| Standardpistol  | Herr                           | x   |     | x    | x   | 1, 2, 3    |                    |
| Standardpistol  | Dam                            | x   |     | x    | x   | 1, 2, 3    |                    |
| Standardpistol  | Junior                         | x   |     | x    | x   | Ä och Y    | "Gemensam HJ o DJ" |
| Standardpistol  | Veteraner                      |     | x   | x    |     |            |                    |
| Standardpistol  | Stödhandsklasser               |     |     | x    |     |            |                    |
| Snabbpistol     | Senior (öppen)                 | x   |     | x    | x   |            |                    |
| Snabbpistol     | Junior (öppen)                 | x   |     | x    | x   |            |                    |
| Snabbpistol     | Veteraner                      |     | x   | x    |     |            |                    |
| Fripistol       | Senior (öppen)                 | x   |     | x    | x   |            |                    |
| Fripistol       | Junior (öppen)                 | x   |     | x    | x   | Ä o Y      |                    |
| Fripistol       | Veteraner                      |     | x   | x    |     |            |                    |
| Mixade lag      | Luftpistol, senior             | x   |     | x    | x   |            | 2 deltagare, m & k |
| Mixade lag      | Luftpistol, junior             | x   |     | x    | x   |            | 2 deltagare, f & p |

Team rows (Herrlag/Damlag/Herrjuniorlag/Damjuniorlag/Lag/Juniorlag; 3 shooters
for senior teams, 2 for dam and junior teams) run alongside the individual
rows in every gren and are omitted here — the app has no team model.

Also in 15.1: for SM and RegM, a team member must compete individually in the
same class; at DM the SDF may allow mixed teams; records only by "rena" lag.
When a gren has too few entrants to count as a championship, _"en damjunior
får anmäla sig i första hand som dam, i andra hand som junior och i sista hand
som herre"_ and _"en herrjunior eller dam får anmäla sig som herre"_ — the
rank-do-not-gate principle again.

### 15.2 Mixade lag

_"Disciplinen Mixade lag genomförs i luftpistol."_ Two shooters, one of each
sex; juniors may shoot in a senior team; veterans compete in the youngest
member's class. See _Mixed teams_ below.

### 15.3 Finaler

Finals are held at SM (shall) and RegM/DM (should) in: luftpistol (herrar,
damer, herrjuniorer, damjuniorer, mixade lag), falling target (the four
categories), snabbluftpistol (senior, juniorer), snabbpistol (senior,
juniorer), sportpistol (damer, damjuniorer). _"Finaler genomförs med 8
deltagare förutom för snabbpistol och snabbluftpistol som har 6 deltagare."_
**Not encoded** — `supportsFinal: false` on every program. Note the
discrepancy with the snabbluftpistol reglemente §9.1 ("de åtta (8) högst
placerade"), recorded under Snabbluftpistol below.

### 15.4 Deltagare utom tävlan

Guests (foreign shooters at SM, out-of-district shooters at DM) may start
"utom tävlan" for hederspris and ranking points but not in a final.

## What ISSF Rule 3.3 lacks, and what SvSF adds

ISSF Rule 3.3 already recognizes (see [ISSF](issf-rules.md)): air pistol
M/MJ/W/WJ; rapid fire M/MJ; standard pistol M/MJ/W/WJ; 25 m Pistol (sport)
MJ/W/WJ; 50 m Pistol M/MJ/W/WJ; centre fire M/W. Every 15.1 row that is one of
those arrives through adoption and is **not** redefined (maintainer,
2026-09-12: "Use ISSF when you can. Do not duplicate events. ISSF has prio").
What remains — the rows ISSF has no event for — is what `SVSF_EVENTS` encodes:

| Discipline id             | Category          | Label (i18n) | Source                                                                  |
| ------------------------- | ----------------- | ------------ | ----------------------------------------------------------------------- |
| `issf-sport-pistol`       | `men` × `open`    | Men          | 15.1 "Sportpistol — Herr"; SM list Sportpistol 25 m, Herr column        |
| `issf-standard-pistol`    | `open` × `junior` | Junior       | 15.1 "Standardpistol — Junior, Gemensam HJ o DJ"; SM list, Öppna column |
| `issf-rapid-fire-pistol`  | `open` × `open`   | Open         | 15.1 "Snabbpistol — Senior (öppen)"; SM list, Öppna column              |
| `issf-rapid-fire-pistol`  | `open` × `junior` | Junior       | 15.1 "Snabbpistol — Junior (öppen)"; SM list, Öppna column              |
| `issf-free-pistol`        | `open` × `open`   | Open         | 15.1 "Fripistol — Senior (öppen)"; SM list, Öppna column                |
| `issf-free-pistol`        | `open` × `junior` | Junior       | 15.1 "Fripistol — Junior (öppen)"; SM list, Öppna column                |
| `issf-centre-fire-pistol` | `open` × `open`   | Open         | 15.1 "Grovpistol — Senior (öppen)"; SM list, Öppna column               |
| `svsf-snabbluftpistol`    | `open` × `open`   | Open         | 15.1 "Snabbluftpistol — Senior (öppen)"; SM list, Öppna column          |
| `svsf-snabbluftpistol`    | `open` × `junior` | Junior       | 15.1 "Snabbluftpistol — Junior (öppen)"; SM list, Öppna column          |

Luftpistol adds nothing: herr, dam, herrjunior and damjunior are all ISSF
events already. Falling target adds nothing here because the discipline itself
is not encoded (below). Every SvSF event carries `regulationId: 'svsf'`, so a
shooter who enabled ISSF alone is offered ISSF's list and one who enabled SvSF
is offered both (`eventsForDiscipline(id, regulationIds)`).

The event ids are `<disciplineId>:<gender>:<age>`, the same scheme as ISSF's,
and a test asserts no SvSF id collides with an ISSF one — the "do not
duplicate" rule as an executable check.

## Grovpistol → ISSF 25 m Centre Fire Pistol

The pistol overview page describes _Sport- och Grovpistol_ as one course with
two calibres: _"Skillnaden är vapnets kaliber, 5,6 mm för sportpistol och
7,6–9,65 mm för grovpistol. Tävlingen består av 30 skott mot precisionstavla
och 30 skott mot snabbpistoltavla."_ That is ISSF's 25 m Centre Fire Pistol,
whose course of fire Pistol Rules 8.7.6.4 defines together with 25 m Pistol
(see [ISSF](issf-rules.md#25m-centre-fire-pistol-grovpistol)). It is therefore
encoded under ISSF as `issf-centre-fire-pistol` — name `{ sv: 'Grovpistol',
en: '25m Centre Fire Pistol' }`, program identical in structure to
`issf-sport-pistol` — and SvSF adds only its open senior category to it
(table above). Rule 3.3 gives it `CFPM M only` and `CFPW W`, so there is no
junior event on either side.

## Snabbluftpistol (Reglemente för 10 m Snabbluftpistol, utgåva januari 2026)

SvSF's own pistol discipline, encoded as `svsf-snabbluftpistol` with
`federation: 'SvSF'`. Cited by section:

- **§1 Allmänt** — _"Detta reglemente är ett svenskt specialreglemente och
  omfattar regler för 10m snabbluftpistol. I övrigt så gäller tillämpliga
  regler i 10m Luftpistol respektive 25m snabbpistol enligt ISSF reglemente
  kap 6 och 8."_ Not an ISSF gren, hence 1.5.2's junior age of 20.
- **§2 Banor** — groups of five targets, 300 mm centre to centre;
  _visningstider_ **10 s, 8 s and 6 s** (+0.2/−0.0 s).
- **§3 Tavlan** — 10-ring 22.0 mm (±0.1), 9-ring 48.5 (±0.2), 8-ring 75.0
  (±0.2), 7-ring 101.5 (±0.2), 6-ring 128.0 (±0.2), 5-ring 154.5 (±0.2);
  innertia 11 mm (±0.1). _"Valörringarna trycks i vit färg"_ and the aiming
  lines beside the centre are white, so the printed black runs out to the
  5-ring — the same layout as the ISSF 25 m rapid fire face, on which this
  target is patterned. Ring width 0.1–0.2 mm; minimum visible card
  170 × 170 mm; values 5–9 printed vertically, the 10 not numbered. Encoded as
  `SVSF_10M_SNABBLUFTPISTOL` in `shared/src/target-scoring/targets.ts`
  (`referenceDiameterMm: 154.5`, `referenceIsSolidBlack: false`).
- **§4 Pistoler** — air pistols per the ISSF reglemente "som kan laddas med
  fem (5) skott".
- **§5 Skjutställning** — one-handed, standing, unsupported; from
  _färdigställning_ (arm at most 45° from vertical). Does not apply to class
  Lp stöd.
- **§6.1** — _"Grenen består av 60 tävlingsskott fördelade på två omgångar om
  vardera 30 skott. Varje omgång är delad i sex (6) serier om fem (5) skott
  vardera, två (2) serier på tio (10) sekunder, två (2) serier på åtta (8)
  sekunder och två (2) serier på sex (6) sekunder. I varje serie ska ett (1)
  skott avlossas mot var och en av de fem (5) tavlorna."_ Encoded as
  `programs/svsf-snabbluftpistol.json`: `shotsPerSeries: 5`, groups
  `[2×10 s, 2×8 s, 2×6 s, 2×10 s, 2×8 s, 2×6 s]` — the same shape as
  `issf-rapid-fire-pistol` with 10/8/6 for 8/6/4.
- **§6.2** — 3 minutes preparation time.
- **§6.3 Provserie** — _"Före varje omgångs början får den tävlande skjuta en
  (1) provserie om fem (5) skott på tio (10) sekunder."_ One per round, i.e.
  two in all; encoded as `sighterSeries: 1` because the schema holds a single
  leading count — the same compression the ISSF rapid fire program documents.
  The sighter inherits the first group's 10 s.
- **§6.4 Kommandon** — marking in whole points: _"Röd för 10 och 10i, vit för
  övriga samt meddelar summa."_ Integer scoring; `allowsDecimal: false`,
  program `scoring: 'integer'`.
- **§7 Avbrott** — an interruption over 10 minutes earns one extra 5-shot
  10 s sighting series.
- **§9 Final** — the eight highest placed from the grundomgång (9.1); hit or
  miss on the 9-ring, one point per hit (9.1); four to eight 5-shot 6 s series
  with eliminations after 3, 4, 5, 6, 7 and 8 series (9.3). **Not encoded**
  (`supportsFinal: false`, like every program). **VERIFY:** Tävlings-PM 15.3
  says six finalists for snabbluftpistol; the reglemente's own §9.1 says eight.
  The reglemente is the newer document (jan 2026 vs. jan 2025). Moot while
  finals are not modelled.

## Falling target (Reglemente för 10 m Falling target, utgåva augusti 2025)

**Not encoded.** §1: a Swedish special reglemente handling deviations from
10 m luftpistol. §3.1: the grundomgång is 5 series of 5 shots, 25 shots, one
shot per target from the left, 40 s per shot on command. §4 Markering: _"Varje
träff ger 1 poäng"_, ties broken on the last series, then the last shot. §5:
final of eight in head-to-head duels of 10 shots each (quarter-, semi-, medal
matches). Hit-or-miss at one point per hit does not fit `scoring: 'rings'`
and a 40 s per-shot exposure does not fit a per-series `timeLimitSeconds`;
whether it gets its own scoring model is a maintainer decision, not something
to force into the ring model. Its SM/DM categories (herr, dam, h-jun, d-jun)
therefore have nothing to attach to yet.

## Klassindelning (Tävlings-PM 14) — not encoded

Transcribed for the record; none of it is in the app, and adding a class
layer to SvSF sessions is a maintainer decision (SPSF's klasser are the only
ones modelled).

**14 Klassindelning för hederspriser** — minimum scores to reach a class:

| Gren                      | Klass 3 | Klass 2 | Klass 1            |
| ------------------------- | ------- | ------- | ------------------ |
| Fripistol (öppen klass)   | 540     | 520     | nybörjare + övriga |
| Snabbpistol (öppen klass) | 550     | 535     | —"—                |
| Grovpistol (öppen klass)  | 565     | 545     | —"—                |
| Sportpistol H             | 570     | 550     | —"—                |
| Sportpistol D             | 560     | 540     | —"—                |
| Standardpistol H          | 550     | 530     | —"—                |
| Standardpistol D          | 535     | 515     | —"—                |
| Luftpistol H              | 560     | 540     | —"—                |
| Luftpistol D              | 550     | 520     | —"—                |

Classing is on results from the previous calendar year's ranking competitions
(at least once), for one year at a time; for 10 m grenar the cut is 1 August;
a class-1 shooter once promoted to 2 never returns; staying in 3 needs the
class-3 minimum the year before; the luftpistol class applies to all 10 m
grenar; a grovpistol class carries over to sportpistol and vice versa.

**14.1 Junior- och ungdomsklasser** (for hederspriser): herrjunior/damjunior
äldre (19–21 during the year), yngre (at most 18); Lp16 P & F (at most 16,
60 shots standing without support hand); Lp 13 Stående (at most 13, 40 shots
standing); Lp13 (at most 13, 40 shots seated with support); Lp11 (at most 11,
40 shots seated with support). 40-shot matches: 50 min (EST) / 60 min
(paper) — "40 skott står numera inte i ISSF reglementena".

**14.2 Veteranklasser** (national competitions): Vet 45 (45–54), Vet 55
(55–64), Vet 65 (65–69), Vet 70 (70–74), Vet 75 (75–79), Vet 80 (80–84),
Vet 85 (85–89), Vet 90 (90+); ages are the age reached during the year.

**14.3 Sammanslagning** — herr- and damklass are never merged, but _"dam får
anmäla sig i herrklass"_; a championship can be won from class 1, 2 or 3;
veterans (Vet 45 and up) compete only in their veteran class.

**14.4 LP Stöd** — an open 40-shot class for shooters who turn at least 14,
seated with a support (shape and material rules given).

**14.5 Stödhandsklasser** — two-handed hold, "precis som vanligt enligt
gällande reglemente för varje gren", in luftpistol, sportpistol, grovpistol
and standardpistol: Senior Stödhand; Veteran Stödhand 65 (65–74); Veteran
Stödhand 75 (75+).

**16 Svenska Veteranmästerskapen** (Riksmästerskap status, all grenar): Herr
45/Dam 45 (45–54), Herr 55/Dam 55, Herr 65/Dam 65 (65–69), Herr 70/Dam 70
(70–74), Herr 75/Dam 75 (75–79), Vet 80, Vet 85, Vet 90; two-shooter teams
competing in the younger member's class. Fripistol and luftpistol are shot as
60 shots in 75 min (EST) / 90 min (paper or markörgrav).

## 25 m standardpistol and 50 m pistol

SvSF publishes its own rules for these two as **mixed-team** events
(`50m Pistol, mixade lag` and its junior variant — two shooters, one of each
sex, qualification plus medal matches). That is a national _team_ format layered
on top of the ISSF individual events, which the ISSF still recognizes in full
(see [ISSF, Rule 3.3](issf-rules.md#recognized-events-and-their-categories-rule-33)).

So neither discipline needs an SvSF definition of its own: adopting ISSF
already brings both. What SvSF does add on them is a category each — see the
delta table above.

## Mixed teams and other team formats — not encoded

The app has no team model, and a two- or five-shooter event has no place in a
per-shooter logbook. Recorded so nobody has to re-read the documents:

- **25 m standardpistol / 50 m pistol, mixade lag** (2022-11-12, "enligt ISSF
  version 221015"): two shooters, one of each sex; qualification in two parts
  plus bronze and silver/gold medal matches; integer marking including inner
  tens, the team result being the sum of both shooters.
- **Luftpistol, mixade lag** — Tävlings-PM 15.1 (senior and junior, SM/RegM/DM)
  and 15.2: _"Disciplinen Mixade lag genomförs i luftpistol."_
- **Klargörande mixade lag (Förbundsstyrelsen 2020-01-21)**: because allmänna
  bestämmelser 2.1.2 requires a championship team to come from one förening,
  and 8.2/8.3 let a shooter represent a different förening per _disciplin_,
  the board decided _"att Mixade lag skall klassas som egen disciplin"_ — so a
  shooter may shoot mixed teams for förening A and everything else for
  förening B.
- **Reglemente för lag-SM 10 m** (2018-02-01): a five-shooter club team, both
  sexes represented, at least one shooter at most 25 years old, one shooting
  seated with support; 150 shots per match with integer scoring, the seated
  shooter 30 and each standing shooter 25–40; 60 min sighting, 180 min match;
  EST only.

## Skyttemärken SvSF (2023-01-12) — pistol, not encoded

SvSF's badge programme runs parallel to SPSF's märken and is not modelled.
The pistol requirements, transcribed so a future encoding does not start from
the PDF:

| Märke                       | Prov                                                                           | Brons | Silver | Guld  |
| --------------------------- | ------------------------------------------------------------------------------ | ----- | ------ | ----- |
| Fripistol 50 m              | tio serier à tio skott, lägsta poäng per serie                                 | 80    | 85     | 90    |
| Sport- och grovpistol 25 m  | precision tio serier à fem skott **och** snabbskjutning tio serier à fem skott | 42/42 | 45/45  | 48/48 |
| Snabbpistol 25 m            | fem omgångar à 30 skott                                                        | 250   | 265    | 275   |
| Standardpistol 25 m         | fem omgångar om 2 × 150 s + 2 × 20 s + 2 × 10 s serier                         | 235   | 255    | 265   |
| Luftpistol 10 m, propaganda | tio serier à fem skott **eller** fem serier à tio skott                        | 36/72 | 38/76  | 40/80 |
| Luftpistol 10 m, påbyggnad  | same; requires the propaganda guld in a previous year                          | 40/80 | 44/88  | 47/94 |

Årtalsmärken: guld with one, two or three stars, each star for meeting the
guld requirement (påbyggnad guld for luftpistol) in three further years.
General rules (p. 7): only members of an SvSF-affiliated förening may earn
them; earning a märke means meeting the requirement _and_ buying ("löst") it;
a higher valör no earlier than the year after the next lower one, except the
luftpistol propaganda märken, which may all be earned in one calendar year, in
order. **Mästarmärket**: four approved tests in competitions in one calendar
year in one gren, plus a placing in the best fifth at that year's SM in the
gren (with more than 30 starters, top six or equal to sixth).

## Nordiska grenar — nothing for pistol

The reglementen index lists _Gevär Nordiska grenar_ (rifle) and _Lerduva
Nordisk trap_ (shotgun) under grenspecifika regler; the pistol section has no
nordiska entry, and the pistol grenspecifika page lists none. Allmänna
bestämmelser 1.3 points nationellt gevär to the "Gevär nordiska" committee.
So there is no nordisk pistol gren to encode — the earlier "not encoded" item
for pistol is closed as _does not exist_.

## Records (7.1) — context only

7.1: Swedish records are kept in the disciplines of the official VM, OS and EM
programmes and in the grenar of SvSF's SM programme "för öppen klass, herrar,
damer, herrjuniorer och damjuniorer". 7.1.3: also at SM, DM and competitions
the idrottskommitté designates, on SvSF-approved paper targets or approved
EST (Sius, Megalink, Meyton, Kongsberg, SportQuantum at the time of writing).
7.1.5: at least three shooters from two clubs, or five from one. 7.1.7:
_"Inom ISSF:s grenar kan juniorer slå juniorrekord vid deltagande i
seniorklass."_ The app records nothing about record eligibility.

## Not encoded after this change

- **Falling target luftpistol** — hit-or-miss scoring; awaits a model.
- **Finals** in any gren, snabbluftpistol's §9 included.
- **Klassindelning** (Tävlings-PM 14, 14.1–14.5, 16): hederspris classes
  1/2/3, junior äldre/yngre, the Lp 11/13/16 youth classes, veteran classes,
  LP Stöd and stödhandsklasser.
- **Team formats**: mixade lag (25 m standard, 50 m, luftpistol), lag-SM 10 m,
  and every Herrlag/Damlag/Juniorlag row in 15.1.
- **Skyttemärken SvSF**.
- The Swedish translations of ISSF ch. 6/7/8 have not been diffed against the
  English text. They govern national competitions, so a value that differs
  between them is a real difference the app does not currently know about.
