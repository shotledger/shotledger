import { describe, expect, it, vi } from 'vitest';
import {
  cardNumbersMatch,
  normalizeCardNumber,
  resolveIdentity,
  WebshooterIdentityUnresolvedError,
} from './identity';

describe('normalizeCardNumber', () => {
  it.each([
    ['12 456', '12456'],
    ['12456', '12456'],
    ['A1234', 'A1234'],
    ['12\t456', '12456'],
    ['12 456', '12456'],
    [null, null],
    [undefined, null],
    ['', null],
    ['None', null],
    ['   ', null],
  ])('normalizeCardNumber(%p) === %p', (input, expected) => {
    expect(normalizeCardNumber(input)).toBe(expected);
  });
});

describe('cardNumbersMatch', () => {
  it.each([
    ['12 456', '12456', true],
    ['12456', '12456', true],
    ['A1234', 'A1234', true],
    ['A1234', 'a1234', false],
    [null, '12456', false],
    [null, null, false],
    ['None', '12456', false],
    ['12\t456', '12456', true],
    ['12 456', '12456', true],
  ])('cardNumbersMatch(%p, %p) === %p', (a, b, expected) => {
    expect(cardNumbersMatch(a, b)).toBe(expected);
  });
});

describe('resolveIdentity', () => {
  it('prefers the explicit override, never calling fetchAuthenticatedUser', async () => {
    const fetchAuthenticatedUser = vi.fn();
    const result = await resolveIdentity({
      override: '111',
      stored: '222',
      fetchAuthenticatedUser,
    });
    expect(result).toBe('111');
    expect(fetchAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('falls back to stored when override is null, never calling fetchAuthenticatedUser', async () => {
    const fetchAuthenticatedUser = vi.fn();
    const result = await resolveIdentity({
      override: null,
      stored: '222',
      fetchAuthenticatedUser,
    });
    expect(result).toBe('222');
    expect(fetchAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('falls back to the API when both override and stored are null/missing', async () => {
    const fetchAuthenticatedUser = vi.fn().mockResolvedValue({ shooting_card_number: '333' });
    const result = await resolveIdentity({ fetchAuthenticatedUser });
    expect(result).toBe('333');
    expect(fetchAuthenticatedUser).toHaveBeenCalledTimes(1);
  });

  it('throws WebshooterIdentityUnresolvedError when all three normalize to null', async () => {
    const fetchAuthenticatedUser = vi.fn().mockResolvedValue({ shooting_card_number: null });
    await expect(
      resolveIdentity({ override: 'None', stored: '', fetchAuthenticatedUser }),
    ).rejects.toBeInstanceOf(WebshooterIdentityUnresolvedError);
  });

  it('the error names itself and explains why', () => {
    const error = new WebshooterIdentityUnresolvedError();
    expect(error.name).toBe('WebshooterIdentityUnresolvedError');
    expect(error.message).toBe(
      'Webshooter identity could not be resolved: no override, stored value, or API result',
    );
  });
});
