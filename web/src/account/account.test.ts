// The web's Account page shows the phone's two refusal lines, counted from
// the pull's `refusals` (docs/specs/sync-family-refusal-spec.md §11.7, FRESH's
// web half; round 5, V5-5c). Rendered to static markup with the app's English
// strings; the counting is tested in shared/src/sync-client/shadow.test.ts.
import type { RefusalEntry } from '@shotledger/shared/src/sync';
import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import en from '../../../app/src/i18n/en.json';
import type { PulledAccount } from '../pull';

// The page's language, without the DOM that ../i18n writes to. Files share a
// worker's module cache (vitest.config.ts): reset it so the page sees the mock.
vi.mock('../i18n', () => ({ default: { language: 'en' } }));
// Static markup runs no effects, so the page never calls the server.
vi.mock('../api', () => ({
  addPasskey: vi.fn(),
  deleteAccount: vi.fn(),
  downloadPhoto: vi.fn(),
  listDevices: vi.fn(),
  listPasskeys: vi.fn(),
  photoUsage: vi.fn(),
  removePasskey: vi.fn(),
  revokeDevice: vi.fn(),
}));
vi.resetModules();
vi.stubGlobal('navigator', { language: 'en-GB' });

const { Account } = await import('./account');

const entry = (rowId: string, reason: RefusalEntry['reason']): RefusalEntry => ({
  tableName: 'shots',
  rowId,
  reason,
  arrival: 3,
  blocker: reason === 'family_refused' ? { tableName: 'shots', rowId: 't2' } : null,
});

const render = (refusals: RefusalEntry[]) =>
  renderToStaticMarkup(
    createElement(Account, {
      tables: { refusals } as unknown as PulledAccount,
      onDeleted: () => undefined,
    }),
  );

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    interpolation: { escapeValue: false },
  });
});

describe('Account page: the Sync card (V5-5c)', () => {
  it('shows the refused and the waiting count, in the phone’s words', () => {
    const html = render([
      entry('t2', 'invalid_payload'),
      entry('t3', 'family_refused'),
      entry('t4', 'family_refused'),
    ]);
    expect(html).toContain(`<h2>${en.account.syncTitle}</h2>`);
    expect(html).toContain(i18next.t('account.refusedChanges', { count: 1 }));
    expect(html).toContain(i18next.t('account.heldChanges', { count: 2 }));
  });

  it('shows only the line that has something to count', () => {
    const html = render([entry('t3', 'family_refused')]);
    expect(html).toContain(i18next.t('account.heldChanges', { count: 1 }));
    expect(html).not.toContain(i18next.t('account.refusedChanges', { count: 1 }));
  });

  it('has no Sync card when nothing is refused or waiting', () => {
    expect(render([])).not.toContain(`<h2>${en.account.syncTitle}</h2>`);
  });
});
