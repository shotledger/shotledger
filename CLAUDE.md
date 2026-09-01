# ShotLedger — agent instructions

Free, open-source (private for now) target-shooting logbook app.
React Native + Expo + TypeScript; local-first SQLite; optional Cloudflare
sync. Android first — **all code must stay iOS-compatible**.

## Read before working

- `plan.md` — what and why; decisions log; roadmap. Update it in the
  same branch as the change it describes.
- `docs/implementation-plan.md` — the execution spec: milestones,
  schema, screen inventory, per-task acceptance criteria. Follow it;
  do not improvise product decisions.
- `docs/reference/spsf-shb-2026.md` — verified domain facts (SPSF rules,
  thresholds, targets) with page citations. The `spsf-domain` skill
  summarizes the hard rules — it triggers on scoring/compliance work.
- `docs/adr/` — architecture decision records. Add one when changing an
  architectural decision; never silently contradict an accepted ADR.

## Hard rules

1. Branch per change (`feat/…`, `fix/…`, `docs/…`); Conventional
   Commits; every commit DCO-signed (`git commit -s`). Never commit to
   `main`. Merges happen only after the maintainer's explicit OK.
2. Never: add dependencies not listed in the implementation plan without
   asking; change the DB schema without a Drizzle migration; weaken or
   delete a test to make it pass; build later-milestone features early.
3. Secrets never enter the working tree — they live under
   `~/agents/shotledger/`. Stage explicit paths only; never `git add -A`.
4. Anything marked `VERIFY:` in the docs is unconfirmed — stop and ask
   the maintainer; never guess regulatory or scoring values.
5. All UI strings via i18n (sv + en) from the first screen.
6. No Android-only native modules; platform quirks go behind wrappers in
   `app/src/platform/`.

## Definition of done

Code + tests written; `pnpm check` green; the relevant checkbox ticked
in `docs/implementation-plan.md` on the same branch; UI tasks include a
screenshot from the agentic loop.

## Agentic loop (fills in at M0 scaffold — keep this section updated)

- Install: `pnpm i`
- Web preview (primary UI iteration surface): `cd app && pnpm expo start
  --web`, then view/interact/screenshot via browser tooling
- Android: KVM emulator + `adb exec-out screencap`; Maestro flows in
  `app/e2e/` (`maestro test e2e/<flow>.yaml`)
- Seed/wipe demo data: dev menu (planned deep link `shotledger://dev/seed`)
- Checks: `pnpm check` (typecheck + lint + unit tests)
