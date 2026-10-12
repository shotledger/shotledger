import { formatTotalScore } from './format-total-score';

describe('formatTotalScore', () => {
  it('shows a sum of integer shots without a decimal', () => {
    expect(formatTotalScore(3010)).toBe('301');
    expect(formatTotalScore(0)).toBe('0');
  });

  it('keeps the decimal when decimal scoring left a fraction', () => {
    expect(formatTotalScore(3014)).toBe('301.4');
  });

  it('shows the placeholder for no value', () => {
    expect(formatTotalScore(null)).toBe('–');
  });
});
