import { countSessionsByType } from './home-session-counts';

describe('countSessionsByType', () => {
  it('counts zero for an empty list', () => {
    expect(countSessionsByType([])).toEqual({ sessionCount: 0, competitionCount: 0 });
  });

  it('counts sessions and competitions separately', () => {
    const sessions = [
      { type: 'training' as const },
      { type: 'competition' as const },
      { type: 'competition' as const },
      { type: 'training' as const },
    ];
    expect(countSessionsByType(sessions)).toEqual({ sessionCount: 4, competitionCount: 2 });
  });

  it('is zero competitions when there are only training sessions', () => {
    const sessions = [{ type: 'training' as const }, { type: 'training' as const }];
    expect(countSessionsByType(sessions)).toEqual({ sessionCount: 2, competitionCount: 0 });
  });
});
