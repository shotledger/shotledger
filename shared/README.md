# `shared/` — domain logic shared by the app and the backend

Pure TypeScript, ESM, no React Native and no Node-only imports, so the same
code runs on a phone, in a Cloudflare Worker and under Vitest. Runtime
dependencies are `zod` and `@noble/hashes` only.

This is where the rules of the sport live. Everything regulatory here is
transcribed from the rule books cited in `docs/reference/` — SPSF's
Skjuthandbok, the ISSF Rule Book and SvSF's bestämmelser — with a section
citation next to each value. Nothing is guessed.

## Modules

| Module                                                                  | What it does                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `disciplines/`                                                          | Discipline and program definitions as JSON data validated by zod, weapon groups, shooter classes, ISSF/SvSF events and eligibility. |
| `regulations/`                                                          | The regelverk registry (SPSF, ISSF, SvSF) and adoption between them (ADR 0011).                                                     |
| `scoring/`                                                              | Series and session scores, märke and standardmedalj thresholds, statistics.                                                         |
| `compliance/`                                                           | The license-activity barometer (FAP 551-3 profile).                                                                                 |
| `target-scoring/`                                                       | Target-face geometry and the maths behind photo scoring.                                                                            |
| `export/`, `json-export/`, `csv/`                                       | PDF club log, the sessions-export file format (its JSON Schema is generated from here) and CSV.                                     |
| `backup/`, `vault/`                                                     | Encrypted backup container and the document vault envelope.                                                                         |
| `sync/`, `sync-client/`                                                 | The changelog sync wire protocol, merge rules and the client-side sync cycle (ADR 0003).                                            |
| `integrations/`, `shotlog/`                                             | WebShooter API client and statistics; ShotLog import.                                                                               |
| `timer/`                                                                | Shot-timer and time-limit engines.                                                                                                  |
| `ammo/`, `calibers/`, `firearms/`, `locations/`, `ranges/`, `licenses/` | Smaller domain models and preset lists.                                                                                             |

## Evidence-first modules

`scoring/`, `compliance/`, `csv/` and the sync engine are developed with the
`old-coder` loop: an approved spec and an evidence report under
`docs/specs/` are the review, since the maintainer does not read this code
line by line. They carry three executable gates on top of the tests:

```bash
pnpm coverage          # 100% threshold on the listed modules (vitest.config.ts)
pnpm mutation          # Stryker, break below 95% (stryker.config.json)
pnpm mutation:schema   # on-disk mutation of the zod schemas Stryker cannot reach
```

Weakening a test to make one of these pass is never an option.

## Tests

`pnpm exec vitest run` from here, or `vitest run` at the repo root, which
also picks up the backend's unit tests and the app's database tests. Test
files sit next to their module as `*.test.ts`; several are executable
specs whose scenario ids map to the tables in `docs/specs/`.
