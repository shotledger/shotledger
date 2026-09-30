# ADR 0011: Regelverk are first-class, and one can adopt another

Status: accepted (2026-09-12; klass layer 2026-09-21)

## Context

Disciplines carried a `federation` field — `SPSF`, `ISSF` or `generic` — and
every implemented discipline was offered to every shooter. That stops working
once a second federation matters: weapon groups and klasser differ between
federations, and a shooter can be a member of several at once.

The maintainer asked for Svenska Skyttesportförbundet (SvSF) support and
suggested calling it ISSF if the two are 1:1. **They are not**
(docs/reference/svsf-rules.md): SvSF's Swedish translations of ISSF chapters
6–8 govern national competitions, and SvSF adds a national layer ISSF has no
concept of — _allmänna bestämmelser_, an SM/DM event list, _skyttemärken_.
Calling SvSF "ISSF" would leave Swedish championships with nowhere to live.

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
- **SvSF** owns its own definitions (`federation: 'SvSF'` — e.g.
  `svsf-snabbluftpistol` and the SM/DM categories ISSF Rule 3.3 has no row
  for) and **adopts ISSF**.

`effectiveRegulations()` resolves adoption transitively, so enabling SvSF puts
ISSF's disciplines in play without SvSF redefining a single one. Per the
maintainer: _"Use ISSF when you can. Do not duplicate events. ISSF has prio."_
An event carries the `regulationId` that defines it, so a shooter who enabled
ISSF alone is not offered SvSF's categories.

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

### No klass layer for SvSF

SvSF sessions carry `event_id` and nothing else — no `shooter_class`, no new
column, no change to `EntryCategory`. SvSF's Tävlings-PM §14 klasser
(transcribed in docs/reference/svsf-rules.md) do not fit the app's model, and
several are really different matches rather than classes.

A klass says which prize table a result is judged against. That is a
competition-administration fact; the app is a personal logbook that records
what was shot, and the organiser decides what it was worth. The hederspris
klass is the clearest case: §14 grades the previous year's **ranking
competitions**, which the app does not distinguish from a club evening, so a
derived klass would be a confident number that is often wrong.

## Consequences

- Adding a federation is a registry entry plus discipline definitions. No
  screen has to learn about it.
- A shooter competing under both SPSF and SvSF sees the union, which is what
  "a member of several at once" means in practice.
- The Settings row shows what is **in effect**, adoption included, so ISSF
  appearing from an SvSF switch is explained rather than surprising.
- `shooter_class` means exactly one thing: an SPSF klass. If SvSF competition
  administration — entries, start lists, prize tables — ever moves into scope,
  this is the section to revisit.
- What SvSF publishes that is still unencoded, and why, is listed in
  docs/reference/svsf-rules.md; inventing regulatory detail is forbidden by
  hard rule 4.
