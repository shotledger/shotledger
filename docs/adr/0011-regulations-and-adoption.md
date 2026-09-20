# ADR 0011: Regelverk are first-class, and one can adopt another

Status: accepted (2026-09-12)

## Context

Disciplines carried a `federation` field — `SPSF`, `ISSF` or `generic` — and
every implemented discipline was offered to every shooter. That works while
one federation matters. It stops working the moment a second does, which is
the open #138 item: _"Weapon group and klass must be dynamic… they differ
between countries and between federations within a country — SPSF vs Svenska
Skyttesportförbundet — and a shooter can be a member of several at once."_

The maintainer asked for Svenska Skyttesportförbundet (SvSF) support and
suggested that, if SvSF is 1:1 with ISSF, the app should simply call it ISSF.

**It is not 1:1.** From SvSF's own regulations page (transcribed in
docs/reference/svsf-rules.md):

- SvSF publishes **Swedish translations of ISSF chapters 6, 7 and 8**, and
  those translations — not ISSF's English text — govern **national**
  competitions. ISSF's own text governs international ones.
- SvSF adds a national layer ISSF has no concept of: _allmänna bestämmelser_,
  an approved SM/DM event list, its own _skyttemärken_.
- SvSF lists some events as _icke officiella grenar_ with SvSF's own rules —
  25 m standardpistol and 50 m pistol. _Nordiska grenar_ and _nordisk trap_
  were never ISSF at all.

Calling SvSF "ISSF" would leave Swedish championships and those events with
nowhere to live.

## Decision

**A regelverk is a first-class thing the shooter enables, and a regelverk may
adopt another.**

`shared/src/regulations/registry.ts` holds the registry. A `Regulation` has an
id, display and short names, the discipline `federation` it owns, whether it
is enabled on a fresh install, and — the load-bearing field — `adopts`.

- **SPSF** owns the SPSF disciplines. Enabled by default: it is the first
  market, and a shooter who competes under nothing else should not have to
  switch anything on to log a session.
- **ISSF** owns the international events.
- **SvSF** owns its national additions and **adopts ISSF**.

`effectiveRegulations()` resolves adoption transitively, so enabling SvSF puts
ISSF's disciplines in play without SvSF redefining a single one. Per the
maintainer: _"Use ISSF when you can. Do not duplicate events. ISSF has prio."_

### Filtering is silent

`disciplinesForRegulations()` and `weaponGroupsForRegulations()` narrow what a
new session offers. There is **no regulation step** when creating a session —
the regulation is implied by the discipline chosen (maintainer's ruling). One
less choice on the screen used most often, at the firing point.

### `generic` survives every filter

Practice against a ring target belongs to no federation. A shooter with every
regulation switched off can still log a session, which is what keeps the app
usable outside any federation it happens to know about.

### Enablement is stored per regulation

One settings row each, not one list. A build that adds a regulation does not
have to migrate anyone's stored value: a row never written falls back to that
regulation's own default.

## Consequences

- Adding a federation is a registry entry plus discipline definitions. No
  screen has to learn about it.
- A shooter competing under both SPSF and SvSF sees the union, which is what
  "a member of several at once" means in practice.
- The Settings row shows what is **in effect**, adoption included, so ISSF
  appearing from an SvSF switch is explained rather than surprising.
- **Not addressed here**: SvSF's SM/DM event list, _nordiska grenar_ and
  _skyttemärken_ are not defined. The model has the shape for them; the data
  does not, and inventing regulatory detail is forbidden by hard rule 4.

## Correction, 2026-09-12

The Context above said SvSF keeps 25 m standardpistol and 50 m pistol because
**ISSF dropped them**. Reading the actual rule book showed that is wrong:
Rule 3.3 still recognizes both in all four categories (STPM/STPW, FPM/FPW,
all `WCH`). What they were dropped from is the **Olympic program**, which
is a different list. SvSF calling them _icke officiella_ is about its own
national championship program, not about whether ISSF defines them.

So the consequence stands but for a better reason: SvSF needs no discipline
definitions of its own for these two, because adopting ISSF already brings
them — exactly the outcome "Use ISSF when you can. Do not duplicate events."
was aiming at. See docs/reference/issf-rules.md, "Recognized events and their
categories", and docs/reference/svsf-rules.md for what SvSF actually publishes
for the two (national **mixed-team** formats, which the app has no model for).

- Klasser remain federation-derived (`shooterClassesForDiscipline`). Making a
  shooter's klass per-federation — the second half of the #138 item — is still
  open.

## Addendum, 2026-09-16 (#228)

SvSF now owns `federation: 'SvSF'` in the registry instead of borrowing
ISSF's, because it has definitions of its own: `svsf-snabbluftpistol`, its one
pistol discipline with a Swedish special reglemente, and `SVSF_EVENTS`, the
SM/DM categories ISSF Rule 3.3 has no row for — a men's sportpistol event, a
common junior event in standardpistol, and open senior and junior events in
snabbpistol, fripistol, grovpistol and snabbluftpistol
(docs/reference/svsf-rules.md, "What ISSF Rule 3.3 lacks"). Grovpistol is
ISSF's 25 m Centre Fire Pistol and so was added as `issf-centre-fire-pistol`,
not as an SvSF discipline — the adoption rule applied. ISSF's definitions still
arrive through `adopts`; `activeFederations(['svsf'])` now yields generic,
ISSF and SvSF, and an event carries the `regulationId` that defines it, so a
shooter who enabled ISSF alone is not offered SvSF's categories. Each event
also carries its own junior age (21 on ISSF grenar, 20 on snabbluftpistol —
allmänna bestämmelser 1.5.1/1.5.2).

Still unencoded, and why: falling target (hit-or-miss scoring, one point per
hit, does not fit ring scoring), finals of any gren, Tävlings-PM 14's
klassindelning (hederspris, junior äldre/yngre, youth, veteran and stödhand
classes — a class layer for SvSF sessions is a maintainer decision), every
team format (no team model) and skyttemärken SvSF. Nordiska grenar turned out
not to exist for pistol.
