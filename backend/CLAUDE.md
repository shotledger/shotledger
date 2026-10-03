# backend/ — the Cloudflare Worker (ELv2)

Rules that apply everywhere are in the root `CLAUDE.md`.

- **Never deploy.** `wrangler deploy` is forbidden for an agent.
- `pnpm test` (in `backend/`) runs the Cloudflare Workers vitest suite. It
  is not part of the root `pnpm check`; CI runs it as its own step. It stays
  on vitest 4 until `@cloudflare/vitest-plugin` supports 5.
- On this sandbox the Workers pool is slow enough that
  `test/sync.spec.ts`'s 205-row pagination case can exceed the default 5 s
  timeout. That is the sandbox, not a regression: confirm with
  `npx vitest run test/sync.spec.ts --testTimeout=60000`.

## Sync end to end, in process

`test/sync-client.spec.ts` drives the real `runSyncCycle` from
`shared/src/sync-client` and the real HTTP transport against the real Worker
in process — real D1, R2 and better-auth, `app.fetch` as the transport, two
in-memory `LocalStore` "devices" on one account. No `wrangler dev`, no
network, nothing deployed. Prefer it over the emulator for a sync change:

```bash
cd backend && npx vitest run test/sync-client.spec.ts --testTimeout=60000
```
