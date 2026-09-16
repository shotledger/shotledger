# Regulations

**Settings → Regulations.** Which rule sets you compete under.

Swedish pistol shooters are not all under one federation, and plenty are under
two at once. What you turn on here decides which disciplines, weapon groups
and events you are offered when you create a session.

Turn on more than one and the new-session form asks which one you are shooting
under before it asks for a discipline — a club's precision evening and an SvSF
air pistol competition have no disciplines in common, and one merged list would
make you hunt through the other federation's to find yours. Free training
against a ring target belongs to no federation, so it stays on offer whichever
regulation you pick.

## What is available

| Regulation                                         | What it covers                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **SPSF** — Svenska Pistolskytteförbundet           | Precision, militär snabbmatch, and the weapon groups (sv _vapengrupper_) A/B/C/R. On by default.                                          |
| **ISSF** — International Shooting Sport Federation | The international events: air pistol, free pistol, sport pistol, standard pistol, rapid fire, centre fire.                                |
| **SvSF** — Svenska Skyttesportförbundet            | Swedish national competition: ISSF's events, plus SvSF's own — snabbluftpistol, and the open, junior and men's classes shot at SM and DM. |

### Disciplines by regulation

What the discipline picker offers for each switch, by the names the app
uses. A discipline listed under SvSF but defined by ISSF is the same
definition, reached through SvSF — it is never entered twice.

| Discipline                                  | SPSF | ISSF | SvSF | Defined by | Category picker                 |
| ------------------------------------------- | ---- | ---- | ---- | ---------- | ------------------------------- |
| Precision                                   | ✓    |      |      | SPSF       | Weapon group and class          |
| Military Rapid Fire                         | ✓    |      |      | SPSF       | Weapon group and class          |
| 10m Air Pistol                              |      | ✓    | ✓    | ISSF       | Event                           |
| 25m Sport Pistol                            |      | ✓    | ✓    | ISSF       | Event (SvSF adds Men)           |
| 25m Standard Pistol                         |      | ✓    | ✓    | ISSF       | Event (SvSF adds Junior)        |
| 25m Rapid Fire Pistol                       |      | ✓    | ✓    | ISSF       | Event (SvSF adds Open, Junior)  |
| 25m Centre Fire Pistol (Grovpistol)         |      | ✓    | ✓    | ISSF       | Event (SvSF adds Open)          |
| 50m Pistol (Fripistol)                      |      | ✓    | ✓    | ISSF       | Event (SvSF adds Open, Junior)  |
| 10m Rapid Fire Air Pistol (Snabbluftpistol) |      |      | ✓    | SvSF       | Event (Open, Junior)            |
| Practice (Ring Target)                      | ✓    | ✓    | ✓    | none       | none — also with everything off |

## SvSF brings ISSF with it

SvSF competes under **ISSF's rulebook** — it publishes Swedish translations of
ISSF chapters 6, 7 and 8, and those govern national competitions.

So turning SvSF on puts the ISSF disciplines in play without you turning ISSF
on separately. The Regulations screen says as much on the ISSF row, rather
than leaving you to wonder why events appeared from a switch that is still
off.

They are not the same thing, which is why both exist:

- The SvSF translations govern **national** competitions; ISSF's own text
  governs **international** ones.
- SvSF adds things ISSF has no concept of — its own general rules, its
  approved SM and DM event list, its own skyttemärken.
- SvSF runs championship classes that ISSF's event list does not have: an
  open class where ISSF splits men and women, a common junior class, and a
  men's sportpistol class.

## What SvSF adds

On top of ISSF's disciplines and events, turning SvSF on gives you:

- **Grovpistol**, under its ISSF name **25 m Centre Fire Pistol**. It is the
  same course of fire as sportpistol shot with a centre-fire gun, so it lives
  in the ISSF list rather than being defined twice.
- **Snabbluftpistol**, SvSF's own 10 m discipline: 60 shots in two rounds of
  2 × 10 s, 2 × 8 s and 2 × 6 s five-shot series, on its own 10 m target.
- **Championship classes** shot at SM and DM, as extra choices in the Event
  picker of a competition:

| Discipline           | SvSF adds                       |
| -------------------- | ------------------------------- |
| 25 m Sport Pistol    | Men                             |
| 25 m Standard Pistol | Junior (men and women together) |
| 25 m Rapid Fire      | Open, Junior                    |
| 50 m Pistol          | Open, Junior                    |
| Centre Fire Pistol   | Open                            |
| Snabbluftpistol      | Open, Junior                    |

Air pistol gets nothing extra: its men's, women's and junior events are
ISSF's already. A junior in these classes is anyone up to and including the
year they turn 21 on the ISSF disciplines, and 20 in snabbluftpistol — the
app preselects with whichever applies.

!!! note "Still not in the app"

    Falling target (scored hit or miss, which the app's ring scoring does not
    cover), finals, mixed teams and other team events, the veteran, youth and
    stödhand classes, and SvSF's skyttemärken. The app is built to hold them;
    the rules have not been entered, and the project does not guess at
    regulatory detail.

## What changes when you turn one on

Only what you are **offered** when creating a session: its disciplines, the
weapon groups those disciplines allow, and — for ISSF and SvSF — the events.
With more than one regulation on, the form asks which one first (see above);
with one, the discipline you pick implies it.

Sessions you have already logged are untouched. Turning a regulation off does
not hide or alter anything you shot under it — a session logged in an SvSF
class keeps that class, and can still be edited, after SvSF is switched off.

## With everything off

You can still log practice sessions against a ring target. That belongs to no
federation, so it survives every filter, and the app stays usable outside any
federation it happens to know about.
