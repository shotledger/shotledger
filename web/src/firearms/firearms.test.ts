// The Firearms pages (#796) render the phone's lines. Rendered to static
// markup with the app's English strings; the model is tested in model.test.ts.
import { SE_EXISTING_HANDGUN_VARIANT } from '@shotledger/shared/src/compliance/profiles/se';
import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import en from '../../../app/src/i18n/en.json';
import type { PulledTables } from '../pull';
import type { FirearmListRow } from './model';

// The page's language, without the DOM that ../i18n writes to. Files share a
// worker's module cache (vitest.config.ts): reset it so the page sees the mock.
vi.mock('../i18n', () => ({ default: { language: 'en' } }));
vi.resetModules();
vi.stubGlobal('navigator', { language: 'en-GB' });

const { Firearms, FirearmRows } = await import('./firearms');

const NOW = Date.now();
const STAMP = '2026-01-01T00:00:00.000Z';
const base = { created_at: STAMP, updated_at: STAMP, deleted_at: null };
type Row = Record<string, unknown>;
const byId = (rows: Row[]) => new Map(rows.map((row) => [row.id as string, row]));
const empty = () => new Map<string, Row>();
const setting = (id: string, value: string) => ({ id, value, ...base });
const PROFILE = [
  setting('complianceProfile', '"se"'),
  setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`),
];

const pistol = {
  id: 'f1',
  ...base,
  make: 'Walther',
  model: 'GSP',
  caliber: '.22 LR',
  weapon_type: 'pistol',
  is_own: 1,
  vapen_id: 'SE-TEST-1',
  round_count: 900,
  maintenance_interval_rounds: 500,
  maintenance_interval_months: null,
  archived_at: null,
};

function tables({
  settings = PROFILE as Row[],
  firearms = [
    pistol,
    { id: 'f2', ...base, make: 'Steyr', model: 'LP10', weapon_type: 'airgun', is_own: 1 },
    {
      id: 'f3',
      ...base,
      make: 'Anschütz',
      model: 'Old',
      weapon_type: 'rifle',
      archived_at: '2026-09-01T10:00:00.000Z',
    },
  ] as Row[],
} = {}): PulledTables {
  return {
    sessions: byId(
      Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        ...base,
        started_at: new Date(NOW - (i + 1) * 7 * 86_400_000).toISOString(),
        type: 'training',
        weapon_group: 'spsf:C',
        firearm_id: i < 3 ? 'f1' : null,
      })),
    ),
    settings: byId(settings),
    firearms: byId(firearms),
    firearm_groups: byId([
      { id: 'g1', ...base, firearm_id: 'f1', group_id: 'spsf:C', is_default_for_group: 1 },
    ]),
    firearm_calibers: byId([
      { id: 'c1', ...base, firearm_id: 'f1', caliber: '.22 Short', position: 0 },
    ]),
    licenses: byId([
      { id: 'l1', ...base, firearm_id: 'f1', license_number: 'TEST-1', valid_until: '2030-01-31' },
    ]),
    maintenance_events: byId([
      {
        id: 'e1',
        ...base,
        firearm_id: 'f1',
        performed_at: '2026-02-01T10:00:00.000Z',
        kind: 'Cleaning',
        round_count_at: 100,
        notes: 'Barrel',
        is_adjustment: 0,
      },
    ]),
    sight_settings: byId([
      {
        id: 'v1',
        ...base,
        firearm_id: 'f1',
        label: '25 m',
        elevation_clicks: 0,
        windage_clicks: 0,
        is_active: 1,
        notes: null,
      },
      {
        id: 'v2',
        ...base,
        firearm_id: 'f1',
        label: '50 m',
        elevation_clicks: 4,
        windage_clicks: -2,
        is_active: 0,
        notes: null,
      },
    ]),
    series: empty(),
    shots: empty(),
    falt_stations: empty(),
    tags: empty(),
    ammo_lots: empty(),
    session_tags: empty(),
  };
}

const render = (rows = tables(), firearmId?: string) =>
  renderToStaticMarkup(createElement(Firearms, { tables: rows, firearmId }));

const hidden = (key: string) => setting(key, 'false');

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

describe('the Firearms list on the web', () => {
  it("lists the active firearms with the phone's status lines, each opening its page", () => {
    const html = render();
    expect(html).toContain('href="#firearms/f1"');
    expect(html).toContain('Walther GSP');
    expect(html).toContain('Pistol');
    expect(html).toContain('>Valid<');
    expect(html).toContain('Maintenance Due');
    expect(html).toMatch(/tone-success"><i aria-hidden="true"><\/i>On Track</);
    // An airgun needs no license, so no license status at all (#365).
    expect(html).toContain('Steyr LP10');
    expect(html).not.toContain('No License');
    // Archived ones only behind the toggle (#799).
    expect(html).not.toContain('Anschütz Old');
    expect(html).toContain('Show Archived (1)');
    expect(html).toContain('Add, change or archive a firearm in the app');
  });

  it('follows the Settings → Features switches', () => {
    const html = render(
      tables({ settings: [...PROFILE, hidden('showMaintenance'), hidden('showLicenseActivity')] }),
    );
    expect(html).not.toContain('Maintenance Due');
    expect(html).not.toContain('On Track');
  });

  it('shows an archived row with no status, and the empty state with no firearm', () => {
    const row: FirearmListRow = {
      id: 'f3',
      make: 'Anschütz',
      model: 'Old',
      weaponType: 'rifle',
      licenseStatus: 'expired',
      maintenanceStatus: 'red',
      licenseActivityStatus: null,
      isIncomplete: true,
      isArchived: true,
    };
    const html = renderToStaticMarkup(
      createElement(FirearmRows, {
        rows: [row],
        shown: { licenseActivity: true, maintenance: true, sightSettings: true },
      }),
    );
    expect(html).toContain('href="#firearms/f3"');
    expect(html).not.toContain('Expired');
    expect(html).not.toContain('Incomplete');
    expect(render(tables({ firearms: [] }))).toContain('No Firearms Yet');
  });
});

describe('a firearm on the web', () => {
  it('shows its own license activity and föreningsintyg criteria with next-session dates', () => {
    const html = render(tables(), 'f1');
    expect(html).toContain('Pistol · My Own · .22 LR · SE-TEST-1');
    expect(html).toContain('License Activity');
    expect(html).toMatch(/Next session by /);
    expect(html).toContain('Föreningsintyg Criteria');
    expect(html).toMatch(/Next session with this firearm by /);
    expect(html).toContain('it cannot attest them');
  });

  it('shows the calibers, groups, sight settings, license and maintenance', () => {
    const html = render(tables(), 'f1');
    expect(html).toContain('Chambering');
    expect(html).toContain('.22 Short');
    expect(html).toContain('Default for');
    expect(html).toContain('>Current<');
    expect(html).toContain('To switch: 4 up, 2 left');
    expect(html).toContain('TEST-1');
    expect(html).toContain('Rounds Since Maintenance');
    expect(html).toContain('>800<');
    expect(html).toContain('Due: 500 rounds since the last maintenance');
    expect(html).toContain('Cleaning');
    expect(html).toContain('Barrel');
    expect(html).toContain('href="#firearms"');
  });

  it('hides what Settings → Features hides, and license activity without a profile', () => {
    const html = render(
      tables({
        settings: [
          ...PROFILE,
          hidden('showMaintenance'),
          hidden('showSightSettings'),
          hidden('showLicenseActivity'),
        ],
      }),
      'f1',
    );
    expect(html).toContain('Rounds Fired');
    expect(html).not.toContain('Rounds Since Maintenance');
    expect(html).not.toContain('Sight Settings');
    expect(html).not.toContain('License Activity');
    expect(render(tables({ settings: [] }), 'f1')).not.toContain('License Activity');
  });

  it('says an archived firearm is archived and measures no activity for it', () => {
    const html = render(tables(), 'f3');
    expect(html).toContain('Archived on');
    expect(html).not.toContain('License Activity');
  });

  it("says an airgun's license is not required, and names a gap", () => {
    const html = render(tables(), 'f2');
    expect(html).toContain('Not required');
    expect(html).toContain('Some details are missing');
  });

  it('shows only the title for a firearm that is not there', () => {
    const html = render(tables(), 'nope');
    expect(html).toContain('href="#firearms"');
    expect(html).not.toContain('Rounds Fired');
  });
});
