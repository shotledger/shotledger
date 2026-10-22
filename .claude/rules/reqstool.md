---
paths:
  - 'docs/reqstool/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '.reqstool-ai.yaml'
---

# reqstool

How reqstool runs, the tagging rules and what belongs in `requirements.yml`
are in `docs/reqstool/README.md`; read it before the first requirement in a
new area. CI runs it after `pnpm check`. Locally it needs the Python client
(`pipx install reqstool`, Python ≥ 3.13); run `pnpm check` first.

Adding a requirement, **in the same branch as the change**:

- an entry in `docs/reqstool/requirements.yml` plus an SVC;
- `@Requirements` on the function that actually implements it, `@SVCs` on
  the test that verifies it — not on the module or a wrapper;
- the tagged test top-level, with a title that does not start with a digit
  (both rules in the README).

The **reqstool-ai** plugin's `reqstool-conventions` skill carries the
annotation and decomposition conventions; `.reqstool-ai.yaml` configures it
and `.mcp.json` wires the `reqstool mcp` server.
