import { describe, expect, it } from 'vitest';

import {
  LOAD_SYSTEM_CODES,
  isLoadSystemCode,
  loadSystemFromLegacy,
  loadSystemKey,
} from './load-system';

describe('loadSystemKey', () => {
  it('folds case, punctuation and Swedish diacritics', () => {
    expect(loadSystemKey('Semi-Automatic')).toBe('semiautomatic');
    expect(loadSystemKey(' semi automatic ')).toBe('semiautomatic');
    expect(loadSystemKey('Hävstångsrepeter')).toBe('havstangsrepeter');
  });
});

describe('isLoadSystemCode', () => {
  it('accepts every shipped code and nothing else', () => {
    for (const code of LOAD_SYSTEM_CODES) expect(isLoadSystemCode(code)).toBe(true);
    expect(isLoadSystemCode('Halvautomat')).toBe(false);
    expect(isLoadSystemCode(null)).toBe(false);
    expect(isLoadSystemCode(undefined)).toBe(false);
  });
});

describe('loadSystemFromLegacy', () => {
  it.each([
    ['Enkelskott', 'single_shot'],
    ['enkelskott', 'single_shot'],
    ['Single shot', 'single_shot'],
    ['single-shot', 'single_shot'],
    ['Halvautomat', 'semi_automatic'],
    ['halvautomatisk', 'semi_automatic'],
    ['Semi-automatic', 'semi_automatic'],
    ['semi auto', 'semi_automatic'],
    ['Revolver', 'revolver'],
    ['Cylinderrepeter', 'bolt_action'],
    ['Bolt action', 'bolt_action'],
    ['Hävstångsrepeter', 'lever_action'],
    ['Pumprepeter', 'pump_action'],
    ['Brytvapen', 'break_action'],
    ['Helautomat', 'fully_automatic'],
  ])('maps %s to %s', (raw, expected) => {
    expect(loadSystemFromLegacy(raw)).toBe(expected);
  });

  it('round-trips a code that has already been migrated', () => {
    for (const code of LOAD_SYSTEM_CODES) expect(loadSystemFromLegacy(code)).toBe(code);
  });

  it('returns null for nothing and for blanks', () => {
    expect(loadSystemFromLegacy(null)).toBeNull();
    expect(loadSystemFromLegacy(undefined)).toBeNull();
    expect(loadSystemFromLegacy('')).toBeNull();
    expect(loadSystemFromLegacy('  -  ')).toBeNull();
  });

  it('refuses to guess an ambiguous legacy string', () => {
    // "Repeter" covers bolt, pump and lever; "automat"/"automatic" is
    // semi-automatic in Swedish gun-speak and in American cartridge names,
    // but full auto in "automatvapen".
    for (const ambiguous of ['Repeter', 'repeter', 'Automat', 'automatic', 'Automatvapen']) {
      expect(loadSystemFromLegacy(ambiguous)).toBeNull();
    }
  });

  it('leaves an unrecognized value for the caller to preserve', () => {
    expect(loadSystemFromLegacy('Gas-operated bullpup')).toBeNull();
  });
});
