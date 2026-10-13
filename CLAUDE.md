# ShotLedger — agent instructions

Open-source (private for now) target-shooting logbook app.
React Native + Expo + TypeScript; local-first SQLite; optional Cloudflare
sync. Android first — **all code must stay iOS-compatible**.

## Read before working

- `app/PRODUCT.md` — what and why: users, positioning, operating
  context, capabilities/constraints, product principles. Update it in
  the same branch as a change that shifts one of these.
- `docs/architecture.md` — the tech-choice table and iOS-readiness
  rules, at a glance.
- `LICENSE`, `CONTRIBUTING.md`, `CLA.md` — the license map (`app/` and
  `shared/` AGPL-3.0-or-later with the §7 permissions, `backend/` ELv2)
  and the terms contributions arrive under. ADR 0017 records why.
- `docs/implementation-plan.md` — the execution spec: milestones,
  schema, screen inventory, per-task acceptance criteria. Follow it;
  do not improvise product decisions.
- `docs/decisions-log-archive.md` — the historical record of narrower
  decisions (a bug's root cause, a library pick, a wording call). Nothing
  here is open work.
- `docs/reference/` — verified domain facts, one file per federation
  (`spsf-shb-2026.md`, `issf-rules.md`, `svsf-rules.md`), each opening
  with links to its rule books. Every value carries a section/page
  citation; the source wins over the file. The `spsf-domain` skill
  summarizes the hard SPSF rules.
- `docs/adr/` — architecture decision records. Add one when changing an
  architectural decision; never silently contradict an accepted ADR.
- `.claude/skills/old-coder/` — evidence-first development loop. **Mandatory
  for changes to `shared/scoring/`, `shared/compliance/` and the sync
  engine**: the maintainer does not read that code line by line;
  the approved spec and evidence report are the review. Routine UI work
  uses normal tests. Vendored byte-for-byte from upstream: do not edit it.
- `docs/release.md` — the release checklist; `docs/store-listing.md` — the
  draft EN/SV store listing. Update `docs/release.md` if the EAS/Play flow
  changes.

## Hard rules

1. Branch per change (`feat/…`, `fix/…`, `docs/…`); Conventional
   Commits; every commit DCO-signed (`git commit -s`). Never commit to
   `main`. Merges happen only after the maintainer's explicit OK.
2. Never: add dependencies not listed in the implementation plan without
   asking; change the DB schema without a Drizzle migration; weaken or
   delete a test to make it pass; build later-milestone features early.
   Adding or removing a dependency also means regenerating the license
   list (how: `app/CLAUDE.md`).
3. Secrets never enter the working tree — they live under
   `~/cloud/agents/secrets/shotledger/`. Stage explicit paths only; never
   `git add -A`.
4. Anything marked `VERIFY:` in the docs is unconfirmed — stop and ask
   the maintainer; never guess regulatory or scoring values. Look the
   value up first: the rule books are public (SHB 2026:
   <https://www.pistolskytteforbundet.se/app/uploads/2026/01/SHB_2026_upplaga-21_NY.pdf>,
   and see the header of `docs/reference/spsf-shb-2026.md`). Ask only
   about what the book genuinely does not say.
5. All UI strings via i18n (sv + en). **Casing:** English screen titles,
   section headers, field labels, tab labels and button labels are
   **Title Case** ("Account & Sync", "Birth Year"); English body copy,
   help text, placeholders and subtitles stay sentence case. Swedish is
   **sentence case throughout** ("Konto och synk", "Födelseår").
6. No Android-only native modules; platform quirks go behind wrappers in
   `app/src/platform/`.
7. **Never commit PII.** No license cards or license numbers, no personal
   photos (target photos included), no names, shooter/card ids, WebShooter
   or ShotLog exports, or any other real person's data — in code,
   fixtures, tests, docs, screenshots or commit messages. Real samples the
   maintainer supplies stay outside the working tree (e.g. `~/tmp/`,
   `~/cloud/agents/notes/shotledger/`); read them to learn the shape, then
   write **synthetic** fixtures. Screenshots use the `/dev` demo data.
8. **Pre-1.0.0, a version number buys nothing — change the format in
   place.** The app is unreleased and the maintainer is its only user, so
   no format, schema or protocol earns a compatibility branch:
   `shotledger.sessions` stays `formatVersion: 1`, the sync protocol stays
   at its version, and a migration may rewrite existing rows. Do not add a
   v2, a shim or a "read both shapes" path for data only this machine has
   produced. This governs **new** compatibility work; it is not a license
   to rip out tolerance that already ships. The rule ends at the first
   released build with other users, and the ADR that declares it says so.
9. **English (US)** for identifiers, filenames, i18n keys and English
   strings and comments (`license`, `caliber`, `center`). Swedish strings
   in `sv.json` and Swedish prose in `docs/reference/` are unaffected.
   **Swedish descriptive terms are translated** (maintainer's ruling,
   2026-09-20): `guldserie` → `goldSeries`, `standardmedalj` →
   `standardMedal`, `märke` → `badge`, `valör` → `grade`, `vapengrupp` →
   `weaponGroup`. Keeping them Swedish as "terms of art" was **rejected**.
   **One carve-out:** a name keeps the spelling of the thing it names, so
   the app never contradicts the document it cites —
   - a federation's official discipline name in identifiers and Swedish
     text (`milsnabb`, `falt`/fältskjutning, ISSF's "25m Centre Fire
     Pistol"). The English label translates a Swedish one ("Military Rapid
     Fire", "Field Shooting"; maintainer's ruling, 2026-10-11);
   - a document's field label (`vapenId`, from `VapenID` on the licence
     card);
   - **stored ids and column names** (`spsf-milsnabb`,
     `official_standardmedalj`): renaming them is a data migration and
     changes the sync wire format. A Drizzle _property_ may be English over
     a Swedish _column_ — `officialStandardMedal` on
     `official_standardmedalj` is intended.
10. **Märken (skill badges) are out of scope** — pistolskyttemärket,
    märke i Nationell helmatch and the like: no badge tracking, progress
    or eligibility. The existing guldserie threshold (`shared/src/scoring/badges.ts`)
    stays. **Standardmedaljer are in scope** in every discipline where SHB
    defines one (Del C.5).

11. **Web parity with the phone** (`app/PRODUCT.md` principle 5). A web
    feature does what the phone does: same fields, rules, counter moves and
    limits; no web-only ability, no silent gap. Read the phone's own code
    (`app/src/`) before specifying web behaviour and cite the function it
    mirrors. Where a spec choice could go either way, the phone's behaviour
    is the answer; do not ask the maintainer. If the phone is wrong, open an
    issue to fix the phone; do not make the web differ.

## Definition of done

Code + tests written; `pnpm check` green from the repo root (the `check`
script in `package.json` is the list of gates); the relevant checkbox
ticked in `docs/implementation-plan.md` on the same branch.

**UI changes are verified in the running app, not by reading the source**,
and include a screenshot. The `run-app` skill covers the web preview and
the emulator.

**Documentation ships in the same PR as the change it describes.** A change
that alters what a user sees or does — a screen, a flow, a setting, a file
format, a limitation — SHALL update `docs/manual/` in the same pull request.
Not a follow-up: the same PR. Documentation that lags the code is wrong,
and a reader cannot tell which half to believe.

CI skips draft PRs (Actions minutes are paid); it runs when the PR is
marked ready. CI also runs gates that `pnpm check` does not. Run the ones
your change touches before pushing:

- docs: `docs/CLAUDE.md`
- backend tests: `backend/CLAUDE.md`
- reqstool: `.claude/rules/reqstool.md` (loads when you edit a tagged test
  or `docs/reqstool/`)

## Setup

`pnpm i` at the repo root (the workspace covers `app/`, `shared/`,
`backend/`). Once per machine: `pnpm approve-builds esbuild workerd`. Once
per contributor: `claude plugin install impeccable@impeccable` (the
marketplace is registered in `.claude/settings.json`).

## Where the rest lives

Loaded automatically when you work in that folder:

- `app/CLAUDE.md` — i18n, licenses, migrations, demo data, web preview
- `shared/CLAUDE.md` — the evidence-first layers for scoring and friends
- `backend/CLAUDE.md` — Workers tests, sync end-to-end, no deploys
- `docs/CLAUDE.md` — manual structure and the three docs gates
- `web/CLAUDE.md` — the read-only web app: shared strings, running it

Running, driving or building the app (web, emulator, Maestro, a phone
APK): the `run-app` skill.
