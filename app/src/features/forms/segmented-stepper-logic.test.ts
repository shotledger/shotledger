import { stepOption } from '@/features/forms/segmented-stepper-logic';

describe('stepOption', () => {
  const values = ['none', '1', '2', '3'];

  it('moves one option either way', () => {
    expect(stepOption(values, '1', 1)).toBe('2');
    expect(stepOption(values, '1', -1)).toBe('none');
  });

  it('stops at both ends', () => {
    expect(stepOption(values, '3', 1)).toBe('3');
    expect(stepOption(values, 'none', -1)).toBe('none');
  });

  it('steps in from the nearest end when the value is not offered', () => {
    expect(stepOption(values, '9', 1)).toBe('none');
    expect(stepOption(values, '9', -1)).toBe('3');
  });

  it('has nothing to step to in an empty list', () => {
    expect(stepOption([], 'x', 1)).toBeUndefined();
  });
});
