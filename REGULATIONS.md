# Regulations

How federation rule books (regelverk) become code. The rule books themselves are
transcribed, with citations, in [`docs/reference/`](docs/reference/): one file
per federation. The source wins over the file, and a value marked `VERIFY:` is
unconfirmed (AGENTS.md hard rule 4). When a change alters one of these
decisions, it updates this file in the same pull request.

Scope rules (märken out, standardmedaljer in, naming) are AGENTS.md hard rules 9
and 10. The architecture is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Regelverk are first-class, and one can adopt another

A regelverk is something the shooter enables. The registry is
`shared/src/regulations/registry.ts`; a `Regulation` has an id, display and
short names, the discipline `federation` it owns, whether it is on for a fresh
install, and `adopts`.

- **SPSF** owns the SPSF disciplines. On by default: it is the first market.
- **ISSF** owns the international events.
- **SvSF** owns its own definitions (`federation: 'SvSF'`, e.g.
  `svsf-snabbluftpistol` and SM/DM categories ISSF Rule 3.3 has no row for) and
  **adopts ISSF**. SvSF is not ISSF: it adds a national layer ISSF has no
  concept of (`docs/reference/svsf-rules.md`).

`effectiveRegulations()` resolves adoption transitively, so enabling SvSF brings
in ISSF's disciplines without redefining any. Maintainer: _"Use ISSF when you
can. Do not duplicate events. ISSF has prio."_ An event carries the
`regulationId` that defines it, so a shooter with ISSF alone is not offered
SvSF's categories. `shared/src/disciplines/entries.test.ts` checks the
no-duplicates rule.

- **Filtering is silent.** `disciplinesForRegulations()` and
  `weaponGroupsForRegulations()` narrow what a new session offers. There is no
  regelverk step when creating a session; the discipline implies it.
- **`generic` survives every filter.** Practice on a ring target belongs to no
  federation, so a shooter with every regelverk off can still log.
- **Enablement is one settings row per regelverk**, so a build that adds one
  migrates nothing: an unwritten row falls back to that regelverk's default.
- Settings shows what is **in effect**, adoption included, so ISSF appearing
  from the SvSF switch is explained.
- Adding a federation is a registry entry plus discipline definitions; no screen
  has to learn about it.

### No klass layer for SvSF

SvSF sessions carry `event_id` and nothing else: no `shooter_class`. A klass
says which prize table a result is judged against, which is competition
administration; the app records what was shot and the organizer decides what it
was worth. SvSF's hederspris klass grades the previous year's ranking
competitions, which the app cannot tell from a club evening, so a derived klass
would be confidently wrong. `shooter_class` means exactly one thing: an SPSF
klass. Revisit only if SvSF entries, start lists or prize tables come into
scope.

## Scoring models

A discipline's `scoring` is `'rings' | 'hits'`
(`shared/src/disciplines/schema.ts`).

- **`rings`**: a shot scores the ring it hit on the discipline's `targetFace`,
  or on its program group's face in a fixed-format session (ARCHITECTURE.md §
  Sessions and series). Precision is rounds, then possibly a final that counts.
- **`hits`** (fältskjutning, SHB Del D): a round is 6–10 stations of six shots;
  the station count belongs to the competition; nothing is scored per shot. A
  station yields hits, figures hit and sometimes poängmål points. The pure model
  is `shared/src/scoring/falt.ts`; persistence and entry are in
  `docs/specs/falt-stations-spec.md`.
  - `targetFace` is rings-only, and the schema rejects a `hits` discipline that
    declares one or allows decimals.
  - **Poängfält is a result mode, not a discipline**: one `spsf-falt`, read as
    vanlig fält or poängfält per competition, with different tie-breaks.
  - The poängmål's ring points are recorded, never derived: SHB defines no ring
    scheme for a fält figure.
  - `spsf-falt` ships no program; the station count is the competition's.
  - Särskjutning (shoot-off) is modeled only in fält, as extra stations that do
    not count. Precision särskjutning (SHB F.6.11.3) is not supported
    (maintainer, 2026-10-14, #727).
  - Code that assumes a ring value per shot (the ShotLog import) filters through
    `ringScoringDisciplines()`.
  - Standardmedalj stays out of fält by construction: fält's is placement-only
    (SHB C.5.1.2.1). Regression-tested.
- Magnumfält (Del E) is a discipline of its own, not built.

Scoring and compliance are evidence-first (AGENTS.md, `shared/CLAUDE.md`): an
approved spec in `docs/specs/` and an evidence report are the review.

## Requirement traceability

Rules that would mislead a shooter about a score, a license renewal or their own
data if wrong are requirements in `docs/reqstool/`, each verified by a tagged
test. How it works and what belongs there is in
[`docs/reqstool/README.md`](docs/reqstool/README.md).
