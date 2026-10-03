// docs/specs/falt-consumers-spec.md L1: a fält session's row carries its
// result, as Home's does, rather than a ring total of 0.

import { buildSessionListRow } from './session-list-row';

const session = {
  id: 's1',
  name: 'Kretsfält',
  type: 'competition' as const,
  startedAt: '2026-05-10T09:00:00.000Z',
  disciplineId: 'spsf-falt',
};

describe('buildSessionListRow', () => {
  it('L1: a fält session carries its hits and figures', () => {
    const row = buildSessionListRow(session, [], [], { hits: 26, figuresHit: 22 });
    expect(row.falt).toEqual({ hits: 26, figuresHit: 22 });
  });

  it('L1: a ring session carries none', () => {
    const row = buildSessionListRow({ ...session, disciplineId: 'spsf-precision' }, []);
    expect(row.falt).toBeNull();
  });
});
