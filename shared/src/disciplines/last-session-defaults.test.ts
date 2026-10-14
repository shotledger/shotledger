import { describe, expect, it } from 'vitest';

import { lastSessionDefaults, mostRecentSession } from './last-session-defaults';

const pickable = (ids: string[]) => (id: string) => ids.includes(id);

describe('lastSessionDefaults', () => {
  it('is null with no sessions, so the form keeps its first-run defaults', () => {
    expect(
      lastSessionDefaults([], { regulationIds: ['spsf'], isFirearmPickable: () => true }),
    ).toBeNull();
  });

  it('takes the discipline and firearm of the latest session, whatever the order given', () => {
    const sessions = [
      { disciplineId: 'spsf-precision', firearmId: 'a', startedAt: '2026-10-01T10:00:00.000Z' },
      { disciplineId: 'spsf-milsnabb', firearmId: 'b', startedAt: '2026-10-07T10:00:00.000Z' },
      { disciplineId: 'spsf-falt', firearmId: 'a', startedAt: '2026-09-01T10:00:00.000Z' },
    ];
    expect(
      lastSessionDefaults(sessions, {
        regulationIds: ['spsf'],
        isFirearmPickable: pickable(['a', 'b']),
      }),
    ).toEqual({ regulationId: 'spsf', disciplineId: 'spsf-milsnabb', firearmId: 'b' });
  });

  it('picks the first enabled regelverk that offers the discipline', () => {
    const sessions = [
      { disciplineId: 'issf-air-pistol', firearmId: null, startedAt: '2026-10-01T10:00:00.000Z' },
    ];
    expect(
      lastSessionDefaults(sessions, {
        regulationIds: ['spsf', 'issf'],
        isFirearmPickable: () => true,
      }),
    ).toEqual({ regulationId: 'issf', disciplineId: 'issf-air-pistol', firearmId: null });
  });

  it('drops a discipline no enabled regelverk offers, but keeps the firearm', () => {
    const sessions = [
      { disciplineId: 'issf-air-pistol', firearmId: 'a', startedAt: '2026-10-01T10:00:00.000Z' },
    ];
    expect(
      lastSessionDefaults(sessions, {
        regulationIds: ['spsf'],
        isFirearmPickable: pickable(['a']),
      }),
    ).toEqual({ regulationId: null, disciplineId: null, firearmId: 'a' });
  });

  it('drops an unknown discipline id', () => {
    const sessions = [
      {
        disciplineId: 'no-such-discipline',
        firearmId: null,
        startedAt: '2026-10-01T10:00:00.000Z',
      },
    ];
    expect(
      lastSessionDefaults(sessions, { regulationIds: ['spsf'], isFirearmPickable: () => true }),
    ).toEqual({ regulationId: null, disciplineId: null, firearmId: null });
  });

  it('drops a firearm the picker no longer offers (archived or deleted)', () => {
    const sessions = [
      { disciplineId: 'spsf-precision', firearmId: 'gone', startedAt: '2026-10-01T10:00:00.000Z' },
    ];
    expect(
      lastSessionDefaults(sessions, {
        regulationIds: ['spsf'],
        isFirearmPickable: pickable(['a']),
      }),
    ).toEqual({ regulationId: 'spsf', disciplineId: 'spsf-precision', firearmId: null });
  });
});

describe('mostRecentSession', () => {
  it('keeps the first of two with the same start', () => {
    const first = { disciplineId: 'x', firearmId: null, startedAt: '2026-10-01T10:00:00.000Z' };
    const second = { ...first, disciplineId: 'y' };
    expect(mostRecentSession([first, second])).toBe(first);
  });
});
