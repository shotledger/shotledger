import { nextSessionDeadline } from './next-session';

describe('nextSessionDeadline', () => {
  it('is the last millisecond the requirement is still met', () => {
    expect(nextSessionDeadline('2026-12-10T09:30:00.001Z').toISOString()).toBe(
      '2026-12-10T09:30:00.000Z',
    );
  });

  it('a lapse at midnight names the day before', () => {
    expect(nextSessionDeadline('2026-05-01T00:00:00.000Z').toISOString()).toBe(
      '2026-04-30T23:59:59.999Z',
    );
  });
});
