// jest.config.js pins TZ; without it CI runs in UTC and local-day bugs pass.
describe('test time zone', () => {
  it('is Europe/Stockholm, with daylight saving', () => {
    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(-60);
    expect(new Date('2026-07-15T12:00:00Z').getTimezoneOffset()).toBe(-120);
  });
});
