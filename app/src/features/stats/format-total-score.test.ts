import { formatTotalScore } from './format-total-score';

describe('formatTotalScore', () => {
  it('shows a sum of integer shots without a decimal', () => {
    expect(formatTotalScore(3010)).toBe('301');
    expect(formatTotalScore(6090)).toBe('609');
    expect(formatTotalScore(0)).toBe('0');
  });

  it('keeps the decimal when decimal scoring left a fraction', () => {
    expect(formatTotalScore(3014)).toBe('301.4');
    expect(formatTotalScore(5)).toBe('0.5');
  });

  it('shows the placeholder for no value', () => {
    expect(formatTotalScore(null)).toBe('–');
    expect(formatTotalScore(null, { empty: '—' })).toBe('—');
  });

  it('prints whole points for an integer-scored session', () => {
    expect(formatTotalScore(4150, { mode: 'integer' })).toBe('415');
    expect(formatTotalScore(420, { mode: 'integer' })).toBe('42');
  });

  it('always prints one decimal for a decimal-scored session, even a whole total', () => {
    expect(formatTotalScore(4150, { mode: 'decimal' })).toBe('415.0');
    expect(formatTotalScore(1047, { mode: 'decimal' })).toBe('104.7');
    expect(formatTotalScore(0, { mode: 'decimal' })).toBe('0.0');
  });

  it('never hides a fraction, whatever the mode says', () => {
    expect(formatTotalScore(3014, { mode: 'integer' })).toBe('301.4');
  });
});
