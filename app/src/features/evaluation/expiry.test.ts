import { evaluateEvaluationWindow, parseExpiresAt } from './expiry';

const EXPIRES = '2026-11-01';
const EXPIRES_MS = Date.parse('2026-11-01T00:00:00Z');
const BEFORE = Date.parse('2026-10-15T12:00:00Z');
const AFTER = Date.parse('2026-11-02T12:00:00Z');

describe('parseExpiresAt', () => {
  it('reads a date as midnight UTC', () => {
    expect(parseExpiresAt('2026-11-01')).toBe(EXPIRES_MS);
  });

  it('reads a date-time with Z or an offset', () => {
    expect(parseExpiresAt('2026-11-01T00:00:00Z')).toBe(EXPIRES_MS);
    expect(parseExpiresAt('2026-11-01T01:00+01:00')).toBe(EXPIRES_MS);
  });

  it('is null when unset, empty or malformed', () => {
    expect(parseExpiresAt(undefined)).toBeNull();
    expect(parseExpiresAt('')).toBeNull();
    expect(parseExpiresAt('next month')).toBeNull();
    expect(parseExpiresAt('01/11/2026')).toBeNull();
    // Without a zone the instant would depend on the phone's time zone.
    expect(parseExpiresAt('2026-11-01T00:00:00')).toBeNull();
    expect(parseExpiresAt('2026-13-45')).toBeNull();
  });
});

describe('evaluateEvaluationWindow', () => {
  it('has no gate when the build sets no date', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: undefined, now: AFTER, highWaterMark: null }),
    ).toEqual({ kind: 'none' });
  });

  it('fails open on a malformed date', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: 'not-a-date', now: AFTER, highWaterMark: AFTER }),
    ).toEqual({ kind: 'none' });
  });

  it('is active before the date', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: BEFORE, highWaterMark: null }),
    ).toEqual({
      kind: 'active',
      expiresAt: EXPIRES_MS,
      highWaterMark: BEFORE,
    });
  });

  it('is expired after the date', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: AFTER, highWaterMark: BEFORE }),
    ).toEqual({
      kind: 'expired',
      expiresAt: EXPIRES_MS,
      highWaterMark: AFTER,
    });
  });

  it('is expired at the exact instant', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: EXPIRES_MS, highWaterMark: null }).kind,
    ).toBe('expired');
  });

  it('stays expired when the clock is set back after the date', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: BEFORE, highWaterMark: AFTER }),
    ).toEqual({
      kind: 'expired',
      expiresAt: EXPIRES_MS,
      highWaterMark: AFTER,
    });
  });

  it('keeps the mark, not the earlier clock, when set back before the date', () => {
    const later = BEFORE + 86_400_000;
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: BEFORE, highWaterMark: later }),
    ).toEqual({
      kind: 'active',
      expiresAt: EXPIRES_MS,
      highWaterMark: later,
    });
  });

  it('ignores a corrupt stored mark', () => {
    expect(
      evaluateEvaluationWindow({ expiresAt: EXPIRES, now: BEFORE, highWaterMark: Number.NaN }),
    ).toEqual({ kind: 'active', expiresAt: EXPIRES_MS, highWaterMark: BEFORE });
  });
});
