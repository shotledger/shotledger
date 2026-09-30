import { localDayEndIso, localDayOf, localDayStartIso } from './local-day';

describe('local day helpers', () => {
  it('bounds a day at local midnight on both ends', () => {
    expect(new Date(localDayStartIso('2026-10-01')).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(localDayEndIso('2026-10-01')).getTime()).toBe(
      new Date(2026, 9, 1, 23, 59, 59, 999).getTime(),
    );
  });

  it('puts a session shot just after local midnight on that day', () => {
    const justAfterMidnight = new Date(2026, 9, 1, 0, 30).toISOString();

    expect(localDayOf(justAfterMidnight)).toBe('2026-10-01');
    expect(justAfterMidnight >= localDayStartIso('2026-10-01')).toBe(true);
    expect(justAfterMidnight <= localDayEndIso('2026-09-30')).toBe(false);
  });

  it('round-trips a day through its start', () => {
    expect(localDayOf(localDayStartIso('2027-01-01'))).toBe('2027-01-01');
    expect(localDayOf(localDayEndIso('2026-12-31'))).toBe('2026-12-31');
  });
});
