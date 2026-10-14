// The License Check pages render the phone's answers (#796). Rendered to
// static markup with the app's English strings; the model is tested in
// license-activity.test.ts.
import { SE_EXISTING_HANDGUN_VARIANT } from '@shotledger/shared/src/compliance/profiles/se';
import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import en from '../../app/src/i18n/en.json';
import type { PulledTables } from './pull';
import type { LicenseCheckView } from './shell/route';

// The page's language, without the DOM that ./i18n writes to. Files share a
// worker's module cache (vitest.config.ts): reset it so the page sees the mock.
vi.mock('./i18n', () => ({ default: { language: 'en' } }));
vi.resetModules();
vi.stubGlobal('navigator', { language: 'en-GB' });

const { LicenseCheck } = await import('./license-check');

const NOW = Date.now();
const STAMP = '2026-01-01T00:00:00.000Z';
const base = { created_at: STAMP, updated_at: STAMP, deleted_at: null };
const byId = (rows: Record<string, unknown>[]) =>
  new Map(rows.map((row) => [row.id as string, row]));
const empty = () => new Map<string, Record<string, unknown>>();

function tables({
  settings = [
    { id: 'complianceProfile', value: '"se"', ...base },
    { id: 'complianceProfileVariant', value: `"${SE_EXISTING_HANDGUN_VARIANT}"`, ...base },
  ],
  sessionCount = 6,
} = {}): PulledTables {
  return {
    sessions: byId(
      Array.from({ length: sessionCount }, (_, i) => ({
        id: `s${i}`,
        ...base,
        started_at: new Date(NOW - (i + 1) * 86_400_000).toISOString(),
        type: 'training',
        weapon_group: 'spsf:C',
        firearm_id: i < 3 ? 'f1' : null,
      })),
    ),
    settings: byId(settings),
    firearms: byId([
      {
        id: 'f1',
        ...base,
        make: 'Walther',
        model: 'GSP',
        weapon_type: 'pistol',
        is_own: 1,
        archived_at: null,
      },
    ]),
    firearm_groups: byId([{ id: 'g1', ...base, firearm_id: 'f1', group_id: 'spsf:C' }]),
    licenses: byId([{ id: 'l1', ...base, firearm_id: 'f1', valid_until: '2030-01-01' }]),
    series: empty(),
    shots: empty(),
    falt_stations: empty(),
    tags: empty(),
    maintenance_events: empty(),
    ammo_lots: empty(),
    session_tags: empty(),
  } as PulledTables;
}

const render = (view: LicenseCheckView, rows = tables()) =>
  renderToStaticMarkup(createElement(LicenseCheck, { tables: rows, view }));

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

describe('License Check on the web', () => {
  it('answers both questions on the overview, with a row per firearm', () => {
    const html = render({ view: 'overview' });
    expect(html).toContain('New Purchase');
    expect(html).toContain('href="#license-check/new-firearm"');
    expect(html).toContain('href="#license-check/firearm/f1"');
    expect(html).toContain('Walther GSP');
    expect(html).toContain('href="#statistics"');
    expect(html).toContain('it cannot attest them');
  });

  it("shows New Firearm's activity rule and the additional-handgun box", () => {
    const html = render({ view: 'newFirearm' });
    expect(html).toContain('What your club certifies when you apply to acquire a handgun.');
    expect(html).toMatch(/activities in the last \d+ months/);
    // Each firearm's box opens the firearm, as the phone's CriterionBlock row.
    expect(html).toMatch(/href="#firearms\/f1"><span class="check-row-text"><span>Walther GSP</);
    expect(html).toContain('href="#license-check"');
  });

  it("shows one firearm's renewal box, and nothing for a firearm it does not hold", () => {
    const html = render({ view: 'firearm', firearmId: 'f1' });
    expect(html).toContain('What your club certifies when you renew a time-limited permit.');
    expect(html).toMatch(/activities with this firearm, .* to .*required/);
    // The phone's "Open Firearm" row.
    expect(html).toMatch(/href="#firearms\/f1"><span class="check-row-text"><span>Open Firearm</);
    const gone = render({ view: 'firearm', firearmId: 'nope' });
    expect(gone).not.toContain('Renewal');
    expect(gone).not.toContain('it cannot attest them');
  });

  it('points to Settings while no profile is chosen', () => {
    const html = render({ view: 'overview' }, tables({ settings: [] }));
    expect(html).toContain('License activity is off.');
    expect(html).toContain('href="#settings"');
  });
});
