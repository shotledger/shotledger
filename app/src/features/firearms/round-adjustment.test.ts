import {
  adjustmentNote,
  parseMaintenanceInterval,
  parseMaintenanceIntervalMonths,
  parseRoundAdjustment,
  roundAdjustmentErrors,
  signedRounds,
} from './round-adjustment';

describe('parseRoundAdjustment', () => {
  it.each([
    ['10', 10],
    ['+10', 10],
    ['-5', -5],
    ['  42 ', 42],
  ])('accepts %j', (text, expected) => {
    expect(parseRoundAdjustment(text)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    '0',
    '-0',
    '1.5',
    '1e3',
    '10 QA test adjustment',
    '--5',
    '+',
    'abc',
    '9'.repeat(20),
  ])('refuses %j', (text) => {
    expect(parseRoundAdjustment(text)).toBeNull();
  });
});

describe('parseMaintenanceInterval', () => {
  it('reads blank as no interval', () => {
    expect(parseMaintenanceInterval('  ')).toEqual({ ok: true, interval: null });
  });

  it('reads whole positive digits', () => {
    expect(parseMaintenanceInterval(' 500 ')).toEqual({ ok: true, interval: 500 });
  });

  it.each(['0', '-5', '1.5', '500 rounds'])('refuses %j', (text) => {
    expect(parseMaintenanceInterval(text)).toEqual({ ok: false });
  });
});

describe('parseMaintenanceIntervalMonths', () => {
  it('reads blank as no time interval', () => {
    expect(parseMaintenanceIntervalMonths('')).toEqual({ ok: true, months: null });
  });

  it('reads whole months from 1 to 120', () => {
    expect(parseMaintenanceIntervalMonths('1')).toEqual({ ok: true, months: 1 });
    expect(parseMaintenanceIntervalMonths(' 6 ')).toEqual({ ok: true, months: 6 });
    expect(parseMaintenanceIntervalMonths('120')).toEqual({ ok: true, months: 120 });
  });

  it.each(['0', '121', '-6', '1.5', '6 months'])('refuses %j', (text) => {
    expect(parseMaintenanceIntervalMonths(text)).toEqual({ ok: false });
  });
});

describe('roundAdjustmentErrors', () => {
  it('is empty for a valid amount and reason', () => {
    expect(roundAdjustmentErrors('-5', 'miscount')).toEqual([]);
  });

  it('names every problem at once', () => {
    expect(roundAdjustmentErrors('ten', '  ')).toEqual(['invalidDelta', 'missingReason']);
  });

  it('flags a blank reason alone', () => {
    expect(roundAdjustmentErrors('10', '')).toEqual(['missingReason']);
  });
});

describe('adjustment note', () => {
  it('signs the amount', () => {
    expect(signedRounds(10)).toBe('+10');
    expect(signedRounds(-5)).toBe('−5');
  });

  it('leads the reason with the amount', () => {
    expect(adjustmentNote(-5, 'miscount')).toBe('−5 · miscount');
  });
});
