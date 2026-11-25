// The web's refused changes with Discard, mirroring the phone's Account &
// Sync (docs/specs/sync-discard-refused-spec.md §2.4; scenarios WEB,
// WEB-OFFLINE, CANCEL). Static markup with the app's English strings, plus
// the pure step and run the page drives.
import type { RefusalEntry } from '@shotledger/shared/src/sync';
import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import en from '../../../app/src/i18n/en.json';
import type { PulledAccount } from '../pull';
import { discardStep, IDLE, Refusals, runDiscard, type DiscardState } from './refusals';

vi.mock('../i18n', () => ({ default: { language: 'en' } }));
vi.stubGlobal('navigator', { language: 'en-GB', onLine: true });

const T2 = { tableName: 'shots', rowId: 't2' } as const;
const refusals: RefusalEntry[] = [
  { ...T2, reason: 'invalid_payload', arrival: 3, blocker: null },
  { tableName: 'shots', rowId: 't3', reason: 'family_refused', arrival: 4, blocker: T2 },
  { tableName: 'licenses', rowId: 'l1', reason: 'invalid_payload', arrival: 5, blocker: null },
];
const tables = {
  refusals,
  shots: new Map(),
  series: new Map([['r1', { id: 'r1', session_id: 's1' }]]),
  sessions: new Map([['s1', { id: 's1', name: 'Kväll', started_at: '2026-11-20T18:00:00.000Z' }]]),
  licenses: new Map([['l1', { id: 'l1', firearm_id: 'f1' }]]),
  firearms: new Map([['f1', { id: 'f1', make: 'Pardini', model: 'SP' }]]),
} as unknown as PulledAccount;

const render = (initial: DiscardState = IDLE, online = true) =>
  renderToStaticMarkup(
    createElement(Refusals, {
      tables,
      discard: vi.fn(),
      refresh: vi.fn(),
      initial,
      online,
    }),
  );

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    interpolation: { escapeValue: false },
  });
});

describe('Refusals (web)', () => {
  it('WEB lists each refused change in the phone’s words, with Discard', () => {
    const html = render();
    expect(html).toContain(i18next.t('account.refusedChanges', { count: 2 }));
    expect(html).toContain(i18next.t('account.heldChanges', { count: 1 }));
    // t2 is not on the server, so its session is unknown here: the kind alone.
    expect(html).toContain('>Shot<');
    expect(html).toContain(i18next.t('account.refusal.waiting', { count: 1 }));
    expect(html).toContain(en.account.refusal.notOnDevice);
    expect(html).toContain('License · Pardini SP');
    expect(html.match(new RegExp(`>${en.account.refusal.discard}<`, 'g'))).toHaveLength(2);
  });

  it('WEB the confirm shows the body and the member line, naming nothing else', () => {
    const html = render({ step: 'asking', key: 'shots:t2' });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(en.account.refusal.confirmBody);
    expect(html).toContain(en.account.refusal.confirmMember);
    expect(html).not.toContain(en.account.refusal.confirmRoot);
  });

  it('WEB a failed discard shows its line under the row', () => {
    const html = render({ step: 'failed', key: 'licenses:l1' });
    expect(html).toContain(en.account.refusal.discardFailed.replace("'", '&#x27;'));
  });

  it('WEB-OFFLINE Discard is disabled offline, and while one runs', () => {
    expect(render(IDLE, false)).toMatch(/<button[^>]*disabled=""[^>]*>Discard</);
    expect(render({ step: 'working', key: 'shots:t2' })).toMatch(
      /<button[^>]*disabled=""[^>]*>Discard</,
    );
    expect(render()).not.toMatch(/disabled=""[^>]*>Discard</);
  });

  it('shows a refused change with nothing waiting, online by default', () => {
    const html = renderToStaticMarkup(
      createElement(Refusals, {
        tables: { ...tables, refusals: [refusals[2]!] } as unknown as PulledAccount,
        discard: vi.fn(),
        refresh: vi.fn(),
      }),
    );
    expect(html).toContain('License · Pardini SP');
    expect(html).not.toContain(i18next.t('account.heldChanges', { count: 0 }));
    expect(html).not.toMatch(/disabled=""[^>]*>Discard</);
  });

  it('shows nothing when nothing is refused or waiting', () => {
    const html = renderToStaticMarkup(
      createElement(Refusals, {
        tables: { ...tables, refusals: [] } as unknown as PulledAccount,
        discard: vi.fn(),
        refresh: vi.fn(),
      }),
    );
    expect(html).toBe('');
  });
});

describe('discardStep', () => {
  it('asks, then confirm sends; cancel sends nothing (CANCEL)', () => {
    const asked = discardStep(IDLE, { type: 'ask', key: 'shots:t2' });
    expect(asked).toEqual({ state: { step: 'asking', key: 'shots:t2' }, send: null });
    expect(discardStep(asked.state, { type: 'cancel' })).toEqual({ state: IDLE, send: null });
    expect(discardStep(asked.state, { type: 'confirm' })).toEqual({
      state: { step: 'working', key: 'shots:t2' },
      send: 'shots:t2',
    });
  });

  it('a result ends the run: discarded goes idle, failed stays on its row', () => {
    const working: DiscardState = { step: 'working', key: 'shots:t2' };
    expect(
      discardStep(working, { type: 'done', outcome: { kind: 'discarded', arrival: 1 } }).state,
    ).toEqual(IDLE);
    expect(
      discardStep(working, { type: 'done', outcome: { kind: 'failed', error: 'network' } }).state,
    ).toEqual({ step: 'failed', key: 'shots:t2' });
  });

  it('ignores a second ask or a confirm while one runs, and a stray event', () => {
    const working: DiscardState = { step: 'working', key: 'shots:t2' };
    expect(discardStep(working, { type: 'ask', key: 'licenses:l1' })).toEqual({
      state: working,
      send: null,
    });
    expect(discardStep(working, { type: 'confirm' })).toEqual({ state: working, send: null });
    expect(discardStep(IDLE, { type: 'confirm' })).toEqual({ state: IDLE, send: null });
    expect(discardStep(IDLE, { type: 'cancel' })).toEqual({ state: IDLE, send: null });
    expect(discardStep(IDLE, { type: 'done', outcome: { kind: 'discarded', arrival: 1 } })).toEqual(
      { state: IDLE, send: null },
    );
  });

  it('cancel or a result while another step is open changes nothing', () => {
    const working: DiscardState = { step: 'working', key: 'shots:t2' };
    expect(discardStep(working, { type: 'cancel' })).toEqual({ state: working, send: null });
    const asking: DiscardState = { step: 'asking', key: 'shots:t2' };
    expect(
      discardStep(asking, { type: 'done', outcome: { kind: 'failed', error: 'network' } }),
    ).toEqual({ state: asking, send: null });
  });

  it('after a failure, the row can be asked again', () => {
    expect(
      discardStep({ step: 'failed', key: 'shots:t2' }, { type: 'ask', key: 'shots:t2' }).state,
    ).toEqual({ step: 'asking', key: 'shots:t2' });
  });
});

describe('runDiscard', () => {
  it('reloads the account after a discard, and not after a failure', async () => {
    const refresh = vi.fn(async () => true);
    const ok = vi.fn(async () => ({ kind: 'discarded', arrival: 4 }) as const);
    await expect(runDiscard({ discard: ok, refresh }, T2)).resolves.toEqual({
      kind: 'discarded',
      arrival: 4,
    });
    expect(ok).toHaveBeenCalledWith(T2);
    expect(refresh).toHaveBeenCalledTimes(1);

    const bad = vi.fn(async () => ({ kind: 'failed', error: 'network' }) as const);
    await runDiscard({ discard: bad, refresh }, T2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
