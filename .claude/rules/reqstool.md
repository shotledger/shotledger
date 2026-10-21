---
paths:
  - 'docs/reqstool/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '.reqstool-ai.yaml'
---

# reqstool (docs/reqstool/README.md)

CI runs `pnpm reqstool:tags` then `pnpm reqstool:status` after `pnpm check`;
`--check-all-reqs-met` fails the build on a requirement with no
implementation or whose verifying test did not pass. Locally it needs the
Python client (`pipx install reqstool`, Python ≥ 3.13). Run `pnpm check`
first: the status command reads the JUnit files both test runners write into
`build/test-results/`, and `pnpm mutation` overwrites the vitest one.

Adding a requirement, **in the same branch as the change**:

- an entry in `docs/reqstool/requirements.yml` plus an SVC;
- `@Requirements` on the function that actually implements it, `@SVCs` on
  the test that verifies it — not on the module or a wrapper. Several ids on
  one tag are **comma**-separated;
- the tagged test keeps a prose title but **must be top-level**, not inside a
  `describe`: the scanner records a nested `it` as `<describe>_<it>` while the
  reporters emit only the leaf. A nested or digit-initial tagged test fails
  loudly (`automated test missing`).

docs/reqstool/README.md sets what belongs in `requirements.yml` versus `docs/reference/`,
`docs/specs/` and `ARCHITECTURE.md` — read it before the first requirement in a new
area. The **reqstool-ai** plugin's `reqstool-conventions` skill carries the
annotation and decomposition conventions; `.reqstool-ai.yaml` configures it
and `.mcp.json` wires the `reqstool mcp` server.
