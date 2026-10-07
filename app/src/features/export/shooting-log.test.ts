import { logSessions, type ShootingLogSession } from './shooting-log';

const session = (id: string, startedAt: string, firearmId: string | null = null) =>
  ({
    id,
    startedAt,
    type: 'training',
    competitionName: null,
    disciplineId: 'spsf-precision',
    weaponGroup: null,
    shooterClass: null,
    location: null,
    firearmId,
  }) satisfies ShootingLogSession;

const SESSIONS = [
  session('a', '2026-02-01T10:00:00.000Z', 'fa-1'),
  session('c', '2026-04-01T10:00:00.000Z', 'fa-2'),
  session('b', '2026-03-01T10:00:00.000Z', 'fa-1'),
];
const ids = (sessions: readonly ShootingLogSession[]) => sessions.map(({ id }) => id);

describe('logSessions', () => {
  it('orders newest first', () => {
    expect(
      ids(logSessions(SESSIONS, { startedFromIso: null, startedToIso: null, firearmId: null })),
    ).toEqual(['c', 'b', 'a']);
  });

  it('includes both ends of the period', () => {
    expect(
      ids(
        logSessions(SESSIONS, {
          startedFromIso: '2026-02-01T10:00:00.000Z',
          startedToIso: '2026-03-01T10:00:00.000Z',
          firearmId: null,
        }),
      ),
    ).toEqual(['b', 'a']);
  });

  it('narrows to one firearm and to the given ids', () => {
    expect(
      ids(logSessions(SESSIONS, { startedFromIso: null, startedToIso: null, firearmId: 'fa-1' })),
    ).toEqual(['b', 'a']);
    expect(
      ids(
        logSessions(SESSIONS, {
          startedFromIso: null,
          startedToIso: null,
          firearmId: null,
          sessionIds: ['a', 'c'],
        }),
      ),
    ).toEqual(['c', 'a']);
  });

  it('leaves its input untouched', () => {
    logSessions(SESSIONS, { startedFromIso: null, startedToIso: null, firearmId: null });
    expect(ids(SESSIONS)).toEqual(['a', 'c', 'b']);
  });
});
