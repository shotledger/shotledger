import type { StatsSeries } from '@shotledger/shared';

import { buildHomeSessionRow } from './home-session-row';

const session = {
  id: 'session-1',
  name: 'Onsdagsträning',
  type: 'training' as const,
  startedAt: '2026-01-05T00:00:00.000Z',
};

function series(overrides: Partial<StatsSeries> & { id: string }): StatsSeries {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    firearmId: null,
    ammoLotId: null,
    isSighter: false,
    isFinal: false,
    shots: [],
    totalOverride: null,
    ...overrides,
  };
}

describe('buildHomeSessionRow', () => {
  it('sums ordinary shot series into the total', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 's1', shots: [{ valueTenths: 90, isInnerTen: false }] }),
      series({ id: 's2', shots: [{ valueTenths: 80, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(17);
  });

  // WS1: a WebShooter/ShotLog import stores a series total with no `shots`
  // rows. Regression for the Home screen showing 0 for such sessions.
  it('uses a total-override series stored total, not its (empty) shots', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'override', shots: [], totalOverride: { tenths: 470, shotCount: 5 } }),
    ]);
    expect(row.total).toBe(47);
  });

  it('mixes a total-override series with an ordinary series', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'override', shots: [], totalOverride: { tenths: 470, shotCount: 5 } }),
      series({ id: 's2', shots: [{ valueTenths: 90, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(56);
  });

  it('excludes a sighter series from the total', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'sighter', isSighter: true, shots: [{ valueTenths: 100, isInnerTen: false }] }),
      series({ id: 's2', shots: [{ valueTenths: 90, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(9);
  });
});
