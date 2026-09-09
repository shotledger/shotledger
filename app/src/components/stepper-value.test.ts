import { clampStepperValue, stepperNext } from './stepper-value';

const MIN = -200;
const MAX = 200;

describe('stepperNext', () => {
  it('enters the range at zero from "not recorded", whichever button is pressed', () => {
    expect(stepperNext(null, 1, MIN, MAX)).toBe(0);
    expect(stepperNext(null, -1, MIN, MAX)).toBe(0);
  });

  it('steps by one in each direction, across zero', () => {
    expect(stepperNext(0, 1, MIN, MAX)).toBe(1);
    expect(stepperNext(0, -1, MIN, MAX)).toBe(-1);
    expect(stepperNext(1, -1, MIN, MAX)).toBe(0);
    expect(stepperNext(-1, 1, MIN, MAX)).toBe(0);
  });

  it('honours a step larger than one', () => {
    expect(stepperNext(0, 1, MIN, MAX, 5)).toBe(5);
    expect(stepperNext(0, -1, MIN, MAX, 5)).toBe(-5);
  });

  it('clamps at both bounds instead of running past them', () => {
    expect(stepperNext(MAX, 1, MIN, MAX)).toBe(MAX);
    expect(stepperNext(MIN, -1, MIN, MAX)).toBe(MIN);
    expect(stepperNext(MAX - 2, 1, MIN, MAX, 10)).toBe(MAX);
  });

  it('never produces a non-integer, even from a non-integer current value', () => {
    expect(stepperNext(3.5, 1, MIN, MAX)).toBe(5);
    expect(stepperNext(3.4, -1, MIN, MAX)).toBe(2);
  });

  it('treats a non-finite current value as zero rather than propagating it', () => {
    expect(stepperNext(Number.NaN, 1, MIN, MAX)).toBe(0);
    expect(stepperNext(Number.POSITIVE_INFINITY, 1, MIN, MAX)).toBe(0);
  });

  it('clamps the zero entry point into a range that excludes zero', () => {
    expect(stepperNext(null, 1, 5, 20)).toBe(5);
    expect(stepperNext(null, -1, -20, -5)).toBe(-5);
  });
});

describe('clampStepperValue', () => {
  it('rounds to an integer', () => {
    expect(clampStepperValue(2.4, MIN, MAX)).toBe(2);
    expect(clampStepperValue(2.5, MIN, MAX)).toBe(3);
    expect(clampStepperValue(-2.4, MIN, MAX)).toBe(-2);
  });

  it('clamps outside values onto the bound', () => {
    expect(clampStepperValue(1000, MIN, MAX)).toBe(MAX);
    expect(clampStepperValue(-1000, MIN, MAX)).toBe(MIN);
  });

  it('falls back to a clamped zero for a non-finite value', () => {
    expect(clampStepperValue(Number.NaN, MIN, MAX)).toBe(0);
    expect(clampStepperValue(Number.NaN, 5, 20)).toBe(5);
  });

  it('leaves an in-range integer alone', () => {
    expect(clampStepperValue(0, MIN, MAX)).toBe(0);
    expect(clampStepperValue(-7, MIN, MAX)).toBe(-7);
  });
});
