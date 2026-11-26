// docs/specs/phone-foreign-keys-spec.md, end to end: the phone's real SQLite
// sync store, with foreign keys on, syncing through a real Worker over HTTP.
// Opt-in, because it needs a server running:
//
//   pnpm --filter @shotledger/web build
//   (cd backend && npx wrangler d1 migrations apply DB --local && npx wrangler dev)
//   SYNC_E2E_URL=http://localhost:8787 npx vitest run src/db/queries/sync-pending.e2e.test.ts
//
// The server pages each table separately (PULL_PAGE_SIZE rows, oldest seq
// first), so a session edited after its children were written arrives a
// page after them: its series and shots reach the phone before it does.
import {
  createAccountApi,
  createHttpSyncTransport,
  PULL_PAGE_SIZE,
  runSyncCycle,
  type ChangeRow,
  type LocalStore,
  type RefusalMark,
} from '@shotledger/shared';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { series, sessions, shots, syncOutbox, syncPendingRows } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addSeries } from './series';
import { createSession, updateSession } from './sessions';
import { addShot } from './shots';
import { createSyncStore } from './sync-store';

const BASE_URL = process.env.SYNC_E2E_URL;

function device(db: Database, token: () => string | null) {
  const transport = createHttpSyncTransport({
    fetchImpl: fetch,
    baseUrl: BASE_URL!,
    getToken: token,
  });
  return (store: LocalStore = createSyncStore(db)) =>
    runSyncCycle({ store, transport, newId: randomUUID });
}

describe.skipIf(!BASE_URL)('E2E the phone store against a running Worker', () => {
  it('children pulled a page before their session wait, then land; foreign keys hold after every page', async () => {
    const api = createAccountApi({ fetchImpl: fetch, baseUrl: BASE_URL!, getToken: () => null });
    // Synthetic address on a reserved TLD, never a real inbox.
    const email = `fk-e2e-${randomUUID()}@example.invalid`;
    const tokenA = (await api.signUp(email, 'correct horse battery staple', 'E2E')).token;
    const tokenB = (await api.signIn(email, 'correct horse battery staple')).token;

    // Device A: more sessions than one pull page, each with a series. The
    // first session also gets two shots, then is renamed last, so its newest
    // version has the highest seq of every session.
    const a = createTestDb();
    const ids: { session: string; series: string }[] = [];
    for (let i = 0; i <= PULL_PAGE_SIZE; i += 1) {
      const session = createSession(a, {
        name: `S${i}`,
        type: 'training',
        disciplineId: 'spsf-precision',
        startedAt: '2026-10-01T10:00:00.000Z',
      });
      ids.push({
        session: session.id,
        series: addSeries(a, { sessionId: session.id, position: 1 }).id,
      });
    }
    const first = ids[0]!;
    const shotIds = [1, 2].map(
      (p) => addShot(a, { seriesId: first.series, position: p, valueTenths: 100 }).id,
    );
    updateSession(a, first.session, { name: 'S0 renamed' });
    const pushed = await device(a, () => tokenA)();
    expect(pushed).toMatchObject({ status: 'ok' });
    expect(a.select().from(syncOutbox).all()).toEqual([]);

    // Device B: the phone's own store, observed after every page it applies.
    const b = createTestDb();
    const real = createSyncStore(b);
    const pages: { pending: string[]; violations: unknown[] }[] = [];
    const observed: LocalStore = {
      ...real,
      applyChanges: async (changes: ChangeRow[], marks?: readonly RefusalMark[]) => {
        await real.applyChanges(changes, marks);
        pages.push({
          pending: b
            .select()
            .from(syncPendingRows)
            .all()
            .map((r) => `${r.tableName}/${r.rowId}`)
            .sort(),
          violations: b.all(sql`PRAGMA foreign_key_check`),
        });
      },
    };
    const pulled = await device(b, () => tokenB)(observed);
    expect(pulled).toMatchObject({ status: 'ok', rejected: 0, invalid: 0 });

    // Page 1 held the first session's series and shots aside; page 2 brought
    // the session and promoted them. No page left a dangling row.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]!.pending).toEqual(
      [`series/${first.series}`, ...shotIds.map((id) => `shots/${id}`)].sort(),
    );
    for (const page of pages) expect(page.violations).toEqual([]);
    expect(pages.at(-1)!.pending).toEqual([]);

    // Everything landed, nothing waits, and promotion queued no upload.
    expect(b.select().from(sessions).all()).toHaveLength(PULL_PAGE_SIZE + 1);
    expect(b.select().from(series).all()).toHaveLength(PULL_PAGE_SIZE + 1);
    expect(
      b
        .select({ id: shots.id })
        .from(shots)
        .all()
        .map((r) => r.id)
        .sort(),
    ).toEqual([...shotIds].sort());
    expect(
      b
        .select()
        .from(sessions)
        .where(sql`id = ${first.session}`)
        .get()!.name,
    ).toBe('S0 renamed');
    expect(b.select().from(syncOutbox).all()).toEqual([]);
    expect(b.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
  }, 120_000);
});
