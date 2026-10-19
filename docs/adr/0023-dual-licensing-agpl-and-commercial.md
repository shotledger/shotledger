# ADR 0023: dual licensing — AGPL for everyone, commercial licenses from the copyright holder

Status: accepted (2026-10-19). Amends ADR 0017. Closes the license choice
between #820 (go proprietary) and #821 (stay AGPL).

Not legal advice. A lawyer's review is still owed (#100).

## Context

After ADR 0017 the maintainer weighed moving off the AGPL to allow a paid
product (audit #809, options #820 and #821). The audit found no blocker to
any choice: Jimisola Laursen is the sole copyright holder, nobody else has
contributed, and no build has been distributed to anyone.

## Decision

1. **The public license map in ADR 0017 stays as it is.** `app/`, `shared/`
   and `web/` remain AGPL-3.0-or-later with the §7 additional permissions,
   `backend/` Elastic-2.0, `shared/src/sync/` Apache-2.0.
2. **The copyright holder also licenses ShotLedger commercially.** Jimisola
   Laursen may use, sell and license any part of ShotLedger under other
   terms — including proprietary terms without the AGPL's obligations — to
   anyone, alongside the public licenses. This is ordinary dual licensing:
   a copyright holder is not bound by the license they grant to others.
3. **Contributions stay dual-licensable through the CLA.** `CLA.md`
   (Harmony CLA, outbound Option Five) already lets "Us" license a
   contribution "under any license, including copyleft, permissive,
   commercial, or proprietary licenses", provided it is also offered under
   the license in force on the submission date. No CLA change is needed;
   `CONTRIBUTING.md` now says the commercial use out loud.
4. **No price, product or paid tier is decided here.** What, if anything, is
   sold is a separate decision. The README, `app/PRODUCT.md`, the manual and
   the store listing keep making no promise about what is or stays free
   (ADR 0017, Consequences).

## Why not the alternatives

- **Proprietary, closed (#820).** Would protect a paid app best while the
  copyright in agent-written code is thin, but gives up the open-source
  trust the app is built on and the forkability users get from the AGPL.
  Dual licensing keeps that and still leaves every commercial route open to
  the copyright holder.
- **AGPL only (#821 as written).** Leaves the copyright holder free to
  license commercially in law, but says nothing about it, so a buyer or a
  contributor could reasonably read the repository as AGPL-only.

## Consequences

- `LICENSE`, `README.md` and `CONTRIBUTING.md` state that commercial
  licenses are available from the copyright holder. There is no commercial
  license text in the repository; each one is drafted with legal advice
  when it is first needed.
- Every AGPL release stays AGPL for good (AGPL §2). A commercial license can
  add rights for its licensee; it cannot take any away from AGPL users.
- The CLA must be in place (signed) before any outside contribution merges,
  or that contribution could only ship under its inbound license. The
  signing mechanism is still on #100.
- ADR 0017's caveat stands and matters more for a commercial license: what a
  licensee pays for is partly thin copyright, so the trademark and the
  hosted service remain the real moat.
- Open: whether commercial licenses are sold by Jimisola Laursen personally
  or by a company (assigning copyright to a company would need a written
  assignment, and CLA §6.3 binds the assignee to the CLA).
