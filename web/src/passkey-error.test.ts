import { describe, expect, it } from 'vitest';

import { passkeyError } from './passkey-error';

function named(name: string, code?: string): Error {
  const error = new Error('x');
  error.name = name;
  if (code) Object.assign(error, { code });
  return error;
}

describe('passkey errors', () => {
  it.each([
    [{ status: 401 }, 'notRegistered'],
    [{ status: 429 }, 'network'],
    [{ status: 408 }, 'network'],
    [{ status: 503 }, 'network'],
    [{ status: 400 }, 'unknown'],
    [{ status: 'x' }, 'unknown'],
  ])('the server answering %j is %s', (error, expected) => {
    expect(passkeyError(error)).toBe(expected);
  });

  it.each([
    [named('NotAllowedError'), 'cancelled'],
    [named('AbortError'), 'cancelled'],
    [named('AbortError', 'ERROR_CEREMONY_ABORTED'), 'cancelled'],
    [named('InvalidStateError'), 'alreadyAdded'],
    [named('InvalidStateError', 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'), 'alreadyAdded'],
    [named('TypeError'), 'network'],
    [named('SecurityError'), 'unknown'],
  ])('the browser throwing %s is %s', (error, expected) => {
    expect(passkeyError(error)).toBe(expected);
  });

  it('anything else is unknown', () => {
    expect(passkeyError('boom')).toBe('unknown');
    expect(passkeyError(null)).toBe('unknown');
  });
});
