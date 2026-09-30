# ADR 0017: license map and business model — AGPL app, ELv2 backend, paid services

Status: accepted (2026-09-30). Supersedes ADR 0004.

Not legal advice. The sources at the end were read in full; a lawyer's review
of the points listed under "Open" is still owed.

## Context

ADR 0004 picked AGPL-3.0-or-later for the whole repository plus a CLA, on the
reasoning that AGPL §13 makes a hosted fork of the sync backend owe its
changes back. Issue #359 then asked what the business model is, and the two
questions turned out to be one: whether the backend is open source decides
what can be charged for, and what is charged for decides which license the
backend needs.

Facts the decision rests on:

- The repository is private, has no forks, no `LICENSE` and one human author.
  Most of the code was written by an AI coding agent under the maintainer's
  direction and committed under the maintainer's name.
- `backend/` compiles `@shotledger/shared` into the Worker bundle (wrangler
  resolves `shared/src/index.ts` directly), so whatever license `shared/`
  carries is inside the backend's executable.
- `app/` bundles Google ML Kit Text Recognition 16.0.1, a proprietary native
  library (`app/src/constants/native-licenses.ts`). It ships inside the APK,
  is not part of Android, and does not exist "only to enable use of the work
  with" Android — so it is not a System Library under AGPL §1, and a plain
  AGPL app could not be lawfully redistributed by anyone (GPL FAQ,
  _GPLIncompatibleLibs_).
- Distribution through the Apple App Store and Google Play imposes terms the
  FSF regards as "further restrictions" under §10 of every GPL-family license.

## Decision

### Business model (issue #359, option C)

Everything the app does on the phone — logging, scoring, statistics,
license-activity evidence, on-device photo scoring, import, export and backup
to a file — is free today. Services ShotLedger itself runs — sync between
devices, web access, server-side photo scoring — may be paid. Price follows
value to the user, not the maintainer's cost.

No absolute is promised. The commitment says what is free _today_; the
maintainer keeps the option to move or gate a feature later. No billing exists
yet. The app stays donation-funded (Stripe Payment Link plus GitHub Sponsors,
#353), a gift that unlocks nothing, and donations continue alongside any paid
service; only the in-app framing of the donation link is revisited when the
first paid service ships (#353, #354).

### License map

| Path                        | License                                                    | SPDX                                                            |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `backend/`                  | Elastic License 2.0, licensor Jimisola Laursen             | `Elastic-2.0`                                                   |
| `shared/src/sync/`          | Apache-2.0 — the protocol the backend compiles in          | `Apache-2.0`                                                    |
| `app/`, `shared/`, all else | AGPL-3.0-or-later with the §7 additional permissions below | `AGPL-3.0-or-later WITH LicenseRef-ShotLedger-AGPL-Permissions` |
| `.claude/skills/old-coder/` | MIT, vendored                                              | `MIT`                                                           |

The root `LICENSE` is the human map; `REUSE.toml` (REUSE 3.3) is the per-file
truth, with the full texts in `LICENSES/`. `reuse` 6.2.0 accepts the
`WITH LicenseRef-` spelling and rejects SPDX 3's `AdditionRef-`, which is why
the permissions file is named as a `LicenseRef-`.

### The two §7 additional permissions

`LICENSES/LicenseRef-ShotLedger-AGPL-Permissions.txt` grants, for every
AGPL-licensed file:

1. **App stores** — conveying object code through a store whose terms
   conflict with the AGPL, provided the Corresponding Source is available
   under the AGPL through a channel without those terms. Modeled on the
   permission Signal added to libsignal-protocol-c in 2016 (the Signal apps
   themselves carry none) rather than Nextcloud's covenant not to sue, so it
   is a real §7 term that travels with the code.
2. **Platform libraries** — combining with Google ML Kit, Google Play
   services, Apple system frameworks and similar vendor libraries, with
   Corresponding Source not having to include them. This is what makes the
   APK redistributable at all, and it covers Play Integrity / App Attest
   (ADR 0005) before they are adopted.

Both are adopted now, while there is one copyright holder; from the first
outside contribution they would need every contributor's consent. Side
effect: F-Droid will list the app with the NonFreeDep anti-feature, or refuse
it, because of ML Kit.

### `shared/` inside the backend

The backend needs exactly two modules of `shared/`: `shared/src/sync/protocol.ts`
(the zod schemas, protocol version and page size) and `merge.ts` (the
conflict rule). Both import only `zod`. Rather than dual-license them into
ELv2 by a grant only the sole copyright holder could make, that directory is
**Apache-2.0** — the Airbyte pattern (ELv2 platform, MIT protocol) and
Elastic's own (ELv2 server, Apache-2.0 clients). The merge rule becoming
permissive is deliberate: the wire format is an idea and a clean-room
server was always lawful, so nothing is given away that the licence could
have kept. The scoring engine, compliance, CSV, backup and the sync _client_
stay AGPL.

Three things hold it in place. `backend/src` imports
`@shotledger/shared/src/sync` only — ESLint `no-restricted-imports`, scoped
to `backend/src/**`, rejects the package root and every other subpath.
`shared/src/sync/**` may import only `zod` and its own files (tests may add
`vitest` and `fast-check`) — the same rule, scoped there. And an esbuild
bundle of `backend/src/index.ts` with a metafile lists
`shared/src/sync/{index,merge,protocol}.ts` as the only `shared/` inputs
among 892 modules; repeat that check when the backend's imports change.
`backend/test/` may keep importing the AGPL sync client from the package
root — tests are not part of the Worker bundle.

An `exports` map with a `./sync` alias was tried and dropped: the app
deep-imports `@shotledger/shared/src/…` in ten files, and TypeScript's
`bundler` resolution does not extension-search `exports` targets, so the map
broke `pnpm typecheck:app` while adding nothing the lint rule does not.

### Contributor terms

DCO sign-off on every commit stays. In addition, `CLA.md` — the Harmony
Individual CLA 1.0 with outbound **Option Five** (contributor keeps copyright;
the maintainer may relicense under any terms and must also keep offering the
terms in force on the submission date), governing law Sweden — is signed once
before a contributor's first pull request merges. `CONTRIBUTING.md` states the
inbound terms per directory. The signing mechanism is chosen on the go-public
checklist (#100).

**What the CLA does:** lets the §7 permissions be amended for a new store or
library, lets a module move between the AGPL and Apache-2.0 parts of
`shared/` if the backend ever needs more than the protocol, and lets a
future version be licensed differently.

**What it does not do:** touch anything already released. AGPL §2 grants its
rights "for the term of copyright on the Program", "irrevocable provided the
stated conditions are met"; every shipped version stays AGPL and forkable,
and a fork of the last free release may keep a feature that a later version
gates. A paywall inside AGPL code is decorative for the same reason. Gating
bites only where the gated code is not published — a server-side service —
which is exactly the shape option C has.

## Why this and not the alternatives

- **ELv2 over FSL / BSL.** FSL's Competing Use covers only "a commercial
  product or service", and each version becomes MIT two years after release
  — a two-year-old sync server is a perfectly good commercial product, and
  the AGPL client can be pointed at it. BSL has the same change-date shape
  over four years. ELv2's hosted-service limitation has no expiry and no
  commercial qualifier. That qualifier cuts both ways: a club hosting the
  backend free for its members is also outside ELv2; the maintainer chose not
  to add a club-hosting permission.
- **ELv2 over PolyForm / a "noncommercial" grant.** Those restrict use, not
  hosting; self-hosting by individuals is wanted.
- **ELv2 in the monorepo over a private backend repo.** Self-hosting and the
  in-process end-to-end test (`backend/test/sync-client.spec.ts`) both need
  the backend beside `shared/`. The repository has never been public, so no
  history rewrite is involved either way.
- **AGPL for the app is unchanged from ADR 0004**, and so is ADR 0013's
  consequence that the repository must be public before a web app is hosted.

## What the licenses do not protect

Copyright in code written by an AI agent is thin. The US Copyright Office
(Part 2, January 2025) holds that "prompts do not alone provide sufficient
control" and that protection reaches the human's selection, arrangement and
modifications, case by case; the EU standard is the "author's own
intellectual creation" (Directive 2009/24/EC art. 1(3), _Infopaq_, _Painer_),
and Digg states the Swedish reading: "Upphovsrätt kan enbart uppstå för verk
som skapats av människor." A defendant copying the backend can argue that no
copyright subsists in the agent-written expression, and then neither ELv2 nor
AGPL has anything to bite on. Anthropic's terms assign the customer "its
right, title and interest (if any)" in outputs — "if any" is the operative
phrase.

So the licenses are notice and posture; the moat is operational:

- accounts, quotas and rate limits on the hosted service (ADR 0005), plus a
  terms-of-service for it;
- server-side model weights are never published;
- the **ShotLedger** trademark, to be registered (PRV / EUIPO) — unaffected by
  authorship and the one instrument that stops someone else selling
  "ShotLedger sync";
- the design record — ADRs, `docs/specs/*-spec.md`, the implementation plan
  and the human review trail in git — which is what evidences human
  conception and redaction if copyright is ever contested. Keep writing it.

The protocol itself is unprotected by either license: `shared/src/sync` is
AGPL, the wire format is an idea, and a clean-room server is always lawful.

## Consequences

- `LICENSE`, `LICENSES/`, `REUSE.toml`, `backend/LICENSE`, `CLA.md`,
  `CONTRIBUTING.md` and the `license` fields in every `package.json` are the
  implementation. `app/PRODUCT.md`, the README and the manual's privacy page
  say "free on the phone today" instead of "never gated".
- Contributions to `app/` and `shared/` arrive under AGPL together with the
  permissions; a contribution that strips them is not merged.
- ADR 0004 is superseded; ADR 0005 gains a pointer to the platform-libraries
  permission.

## Open (maintainer actions)

- CLA mechanism (bot or signatures file) before the first outside PR; whether
  `reuse lint` joins CI (#100).
- Trademark registration.
- Lawyer review: ELv2's enforceability against a stranger who did not accept
  it, the Swedish position on agent-written code, and the Cyber Resilience
  Act classification of a free app monetized through a paid service.
- Whether Anthropic's Commercial or Consumer terms govern the maintainer's
  plan.

## Sources

- AGPL-3.0: <https://www.gnu.org/licenses/agpl-3.0.txt> (§§1, 2, 7, 10, 13)
- GPL FAQ: <https://www.gnu.org/licenses/gpl-faq.html> — _MereAggregation_,
  _GPLIncompatibleLibs_, _DeveloperViolate_, _CanDeveloperThirdParty_,
  _AGPLv3ServerAsUser_
- Elastic License 2.0 and FAQ: <https://www.elastic.co/licensing/elastic-license>,
  <https://www.elastic.co/licensing/elastic-license/faq>
- FSL-1.1: <https://fsl.software/>
- Signal, "License update" (2016): <https://signal.org/blog/license-update/>;
  Nextcloud iOS `COPYING.iOS`
- FSF on the App Store: <https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement>
- REUSE 3.3: <https://reuse.software/spec-3.3/>
- Harmony agreements: <https://www.harmonyagreements.org/>; DCO:
  <https://developercertificate.org/>
- US Copyright Office, _Copyright and Artificial Intelligence, Part 2_ (2025):
  <https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf>
- Digg, _Bedöm upphovsrätten vid användningen av generativ AI_:
  <https://www.digg.se/ai-for-offentlig-forvaltning/riktlinjer-for-generativ-ai/bedom-upphovsratten-vid-anvandningen-av-generativ-ai>
- Hugenholtz & Quintais, _Copyright and Artificial Creation_ (IViR):
  <https://www.ivir.nl/publicaties/download/AI-Copyright.pdf>
- Anthropic Commercial Terms: <https://www.anthropic.com/legal/commercial-terms>
