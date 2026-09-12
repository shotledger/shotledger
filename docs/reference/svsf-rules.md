# SvSF domain facts — Svenska Skyttesportförbundet

Verified extraction with section citations. One of three federation reference
files — see also [SPSF](spsf-shb-2026.md) and [ISSF](issf-rules.md).

SvSF is the Swedish member federation of the ISSF, and the one the app means
by the `SvSF` regelverk (ADR 0011). It is **not** a synonym for ISSF: it
publishes Swedish translations of the ISSF chapters, which govern national
competitions, and adds a national layer ISSF has no concept of.

## Where to get the rule books

All of it hangs off one page, which is the right place to start every lookup:

| What                                    | Link                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Reglementen (the index page)**        | <https://www.skyttesport.se/taevlingsverksamhet/reglementen/>                                      |
| SvSF allmänna bestämmelser (2026-03-13) | <https://www.skyttesport.se/media/farftxti/105-allmaenna-bestaemmelser-2026-03-13.pdf>             |
| ISSF kap. 6 — allmänna tekniska (sv)    | <https://www.skyttesport.se/media/1eof5lm4/issf-reglemente-6-kap-allmaenna-tekniska-juli-2026.pdf> |
| ISSF kap. 7 — gevär (sv)                | <https://www.skyttesport.se/media/kzypfdze/issf-reglemente-7-kap-gevaer-2026-07.pdf>               |
| **ISSF kap. 8 — pistol (sv)**           | <https://www.skyttesport.se/media/tswn5nx3/issf-reglemente-8-kap-pistol-juli-2026.pdf>             |
| Godkända SM- och DM-grenar              | <https://www.skyttesport.se/media/f40jguzr/rf-godkanda-sm-grenar-mars-2023.pdf>                    |
| Regler 25 m standardpistol, mixade lag  | <https://www.skyttesport.se/media/wpmdnavg/regler-25m-standardpistol-mixade-lag.pdf>               |
| Regler 50 m pistol, mixade lag          | <https://www.skyttesport.se/media/zwmbmnm0/regler-50m-pistol-mixade-lag.pdf>                       |
| Skyttemärken SvSF                       | <https://www.skyttesport.se/media/ovfjszky/skyttemaerken-svsf.pdf>                                 |
| SvSF stadgar                            | <https://www.skyttesport.se/media/ixxb0002/stadgar-svsf-2025-04-13.pdf>                            |

The media paths carry an opaque id that changes when a document is reissued,
so a dead link means "re-read the index page", not "the document is gone".

Source used below: `105-allmaenna-bestaemmelser-2026-03-13.pdf`, fetched
2026-09-12. When it and this file disagree, it wins — fix this file.

## Juniors: two different ages (1.5)

SvSF uses the ISSF age for ISSF events and the SPSF-like age for everything
else. Both are year-based, so a birth year remains enough:

- **1.5.1** — ISSF grenar plus nordisk trap: _"Juniorer är de som fyller
  högst 21 år det år tävlingen äger rum."_
- **1.5.2** — Övriga grenar: _"Juniorer är de som fyller högst 20 år."_

Every SvSF discipline the app currently offers is an ISSF one (SvSF adopts
ISSF, ADR 0011), so `ISSF_JUNIOR_MAX_AGE = 21` is the one in force. If a
non-ISSF SvSF gren is ever encoded, it needs 1.5.2's 20 instead — the two
cannot share one constant.

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
  no row for. **Not yet encoded**: which grenar they run in comes from the
  SM/DM list, which has not been read (hard rule 4).

Section 5.2.1 leaves further class division inside herrar/damer/juniorer —
prestationsklasser, åldersklasser, öppen klass — to each idrottskommitté,
and allows classes to be merged at low turnout. So an SvSF klass layer exists
in principle but is per-gren and per-committee, not a fixed list like SPSF's
nine.

## 25 m standardpistol and 50 m pistol

SvSF publishes its own rules for these two as **mixed-team** events
(`50m Pistol, mixade lag` and its junior variant — two shooters, one of each
sex, qualification plus medal matches). That is a national _team_ format layered
on top of the ISSF individual events, which the ISSF still recognizes in full
(see [ISSF, Rule 3.3](issf-rules.md#recognized-events-and-their-categories-rule-33)).

So neither discipline needs an SvSF definition of its own: adopting ISSF
already brings both. The mixed-team formats are **not encoded** — the app has
no team model, and a two-shooter event has no place in a per-shooter logbook.

## Not encoded

- **Godkända SM- och DM-grenar** — the approved championship programme.
- **Nordiska grenar** and **nordisk trap** — never ISSF events at all.
- **Skyttemärken SvSF** — SvSF's own badge programme, parallel to SPSF's.
- The Swedish translations of ISSF ch. 6/7/8 have not been diffed against the
  English text. They govern national competitions, so a value that differs
  between them is a real difference the app does not currently know about.
