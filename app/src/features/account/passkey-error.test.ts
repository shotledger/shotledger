import { AuthError } from '@shotledger/shared';

import { passkeyErrorKey } from './passkey-error';

describe('passkey errors on the phone', () => {
  it.each([
    ['signIn', 401, 'notRegistered'],
    ['add', 401, 'signInAgain'],
    ['add', 403, 'signInAgain'],
    ['signIn', 403, 'unknown'],
    ['signIn', 400, 'unknown'],
    ['add', 429, 'network'],
    ['signIn', 408, 'network'],
    ['signIn', 503, 'network'],
  ] as const)('%s answered %i is %s', (intent, status, expected) => {
    expect(passkeyErrorKey(new AuthError(status, 'x'), intent)).toBe(expected);
  });

  it.each([
    ['UserCancelled', 'cancelled'],
    ['NoCredentials', 'cancelled'],
    ['Interrupted', 'cancelled'],
    ['CredentialAlreadyExists', 'alreadyAdded'],
    ['BadConfiguration', 'unknown'],
    ['NotSupported', 'unknown'],
  ])('the OS prompt failing with %s is %s', (code, expected) => {
    expect(passkeyErrorKey({ error: code, message: 'm' }, 'signIn')).toBe(expected);
  });

  it('a request that never reached the server is a network failure', () => {
    expect(passkeyErrorKey(new TypeError('Network request failed'), 'signIn')).toBe('network');
    expect(passkeyErrorKey(null, 'add')).toBe('network');
  });
});
