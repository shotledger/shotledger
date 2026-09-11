import { describe, expect, it } from 'vitest';

import { fixtureResultRow, fixtureSignup } from './api/fixtures';
import { hasResultForCard } from './my-results';

function rowForCard(cardNumber: string | null) {
  const signup = fixtureSignup();
  return {
    ...fixtureResultRow(),
    signup: {
      ...signup,
      user: { ...signup.user!, shooting_card_number: cardNumber },
    },
  };
}

describe('hasResultForCard', () => {
  it('finds the shooter in a competition they actually shot', () => {
    expect(hasResultForCard([rowForCard('12345')], '12345')).toBe(true);
  });

  it('rejects a competition they only signed up for', () => {
    // The whole point: a no-show or a DNF leaves a signup and no result.
    expect(hasResultForCard([rowForCard('99999')], '12345')).toBe(false);
  });

  it('ignores spacing differences in card numbers', () => {
    // wscli strips whitespace from these for the same reason.
    expect(hasResultForCard([rowForCard('123 45')], '12345')).toBe(true);
  });

  it('never matches a result row whose signup is gone', () => {
    expect(hasResultForCard([{ ...fixtureResultRow(), signup: null }], '12345')).toBe(false);
  });

  it('never matches a row whose shooter has no card number', () => {
    expect(hasResultForCard([rowForCard(null)], '12345')).toBe(false);
  });

  it('matches nothing when we do not know our own card number', () => {
    // Better an empty list than every competition in the database.
    expect(hasResultForCard([rowForCard('12345')], null)).toBe(false);
  });

  it('handles an empty results list', () => {
    expect(hasResultForCard([], '12345')).toBe(false);
  });
});
