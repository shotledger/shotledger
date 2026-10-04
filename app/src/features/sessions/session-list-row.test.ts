// docs/specs/falt-consumers-spec.md L1: a fält session's row carries its
// result, as Home's does, rather than a ring total of 0.

import { faltSummaryOf } from '@/features/session/format-falt-result';

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
    const falt = { mode: 'falt' as const, hits: 26, figuresHit: 22, poangfaltPoints: 48 };
    const row = buildSessionListRow(session, [], [], falt);
    expect(row.falt).toEqual(falt);
  });

  it('#513: a poängfält session carries its mode and points sum', () => {
    const falt = faltSummaryOf('poangfalt', { hits: 41, figuresHit: 34, poangfaltPoints: 75 });
    const row = buildSessionListRow(session, [], [], falt);
    expect(row.falt).toEqual({ mode: 'poangfalt', hits: 41, figuresHit: 34, poangfaltPoints: 75 });
  });

  it('#513: a fält session with no stored mode reads as fält', () => {
    const falt = faltSummaryOf(null, { hits: 26, figuresHit: 22, poangfaltPoints: 48 });
    expect(buildSessionListRow(session, [], [], falt).falt?.mode).toBe('falt');
  });

  it('L1: a ring session carries none', () => {
    const row = buildSessionListRow({ ...session, disciplineId: 'spsf-precision' }, []);
    expect(row.falt).toBeNull();
  });
});
