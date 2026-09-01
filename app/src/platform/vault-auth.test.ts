import * as LocalAuthentication from 'expo-local-authentication';

jest.mock('expo-local-authentication');

import { requestVaultAccess } from './vault-auth';

const mockedHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockedGetLevel = LocalAuthentication.getEnrolledLevelAsync as jest.Mock;
const mockedAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock;

beforeEach(() => {
  mockedHasHardware.mockReset();
  mockedGetLevel.mockReset();
  mockedAuthenticate.mockReset();
});

describe('vault biometric gate', () => {
  it('prompts and grants access when hardware and biometrics are enrolled', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedGetLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    mockedAuthenticate.mockResolvedValue({ success: true });

    const result = await requestVaultAccess('Unlock vault');

    expect(mockedAuthenticate).toHaveBeenCalledWith({ promptMessage: 'Unlock vault' });
    expect(result).toEqual({ granted: true, deviceUnsecured: false });
  });

  it('denies access when the prompt fails', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedGetLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    mockedAuthenticate.mockResolvedValue({ success: false, error: 'user_cancel' });

    const result = await requestVaultAccess('Unlock vault');

    expect(result).toEqual({ granted: false, deviceUnsecured: false });
  });

  it('grants access without prompting when there is no biometric hardware', async () => {
    mockedHasHardware.mockResolvedValue(false);
    mockedGetLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    const result = await requestVaultAccess('Unlock vault');

    expect(mockedAuthenticate).not.toHaveBeenCalled();
    expect(result).toEqual({ granted: true, deviceUnsecured: true });
  });

  it('grants access without prompting when nothing is enrolled at all (graceful fallback)', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedGetLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    const result = await requestVaultAccess('Unlock vault');

    expect(mockedAuthenticate).not.toHaveBeenCalled();
    expect(result).toEqual({ granted: true, deviceUnsecured: true });
  });

  it('still prompts (falls back to device passcode) when only a passcode is enrolled, no biometrics', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedGetLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    mockedAuthenticate.mockResolvedValue({ success: true });

    const result = await requestVaultAccess('Unlock vault');

    expect(mockedAuthenticate).toHaveBeenCalled();
    expect(result).toEqual({ granted: true, deviceUnsecured: false });
  });
});
