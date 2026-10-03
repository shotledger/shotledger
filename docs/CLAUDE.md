# docs/

Rules that apply everywhere are in the root `CLAUDE.md`, including that a
user-visible change updates `docs/manual/` in the same PR.

`docs/manual/` is the **user** manual, written for shooters, not
contributors, and published with MkDocs (`docs_dir: docs/manual`).
Contributor material — `adr/`, `specs/`, `implementation-plan.md` — is not
part of it.

## Where a new paragraph goes

The manual follows [Diátaxis](https://diataxis.fr/); the directories are the
quadrants, and the nav deliberately does not name them.

| It answers                                                 | Directory            |
| ---------------------------------------------------------- | -------------------- |
| "walk me through my first session"                         | `getting-started.md` |
| "how do I do X" — steps, in order                          | `guides/`            |
| "what is X" — a lookup, values and tables                  | `reference/`         |
| "why is it like this" — a model, a limitation, a trade-off | `explanation/`       |

A page doing two of these is two pages. Explanation leaking into `guides/`
is the failure mode this exists to stop.

## The three docs gates

Not in `pnpm check` (they need `pip install -r docs/requirements.txt`), but
CI's _Build (strict)_ job runs them, so a docs change that passes `check` can
still fail CI. Run all three before pushing:

- `mkdocs build --strict` — links and nav.
- `node scripts/docs-translation-check.mjs` — fails when a `.sv.md` page's
  last commit is older than its English source. An English-only edit with
  no Swedish counterpart cannot pass it; that is a decision to take, not a
  gate to loosen.
- `node scripts/docs-anchor-check.mjs` (`pnpm docs:anchors`) — fails on a
  link to a heading that no longer exists. `--strict` only logs that at
  INFO, so the build does not catch it.

## `mkdocs serve`

It does not pick up a newly installed plugin, so a language selector or nav
change can be invisible in a server started before it — restart it. Never
`pkill -f "mkdocs serve"`: the pattern matches the shell running it and kills
your own session. Find the PID with `ps -eo pid,args | grep … | grep -v grep`
and kill that.
