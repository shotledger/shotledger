// Biometric/passcode gate for the vault screen. Graceful
// fallback: expo-local-authentication's own authenticateAsync() already
// falls back to the device passcode/PIN when biometrics fail or aren't
// enrolled but a passcode exists (disableDeviceFallback defaults to false).
// This wrapper only adds the one case that library doesn't handle: nothing
// at all is enrolled (no biometrics, no passcode) — SecurityLevel.NONE — in
// which case there is nothing to gate against, so access is allowed with a
// `deviceUnsecured` flag the UI surfaces as a warning instead of a prompt.
import * as LocalAuthentication from 'expo-local-authentication';

export type VaultGateResult =
  { granted: true; deviceUnsecured: boolean } | { granted: false; deviceUnsecured: false };

export async function requestVaultAccess(promptMessage: string): Promise<VaultGateResult> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const level = await LocalAuthentication.getEnrolledLevelAsync();

  if (!hasHardware || level === LocalAuthentication.SecurityLevel.NONE) {
    return { granted: true, deviceUnsecured: true };
  }

  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  return result.success
    ? { granted: true, deviceUnsecured: false }
    : { granted: false, deviceUnsecured: false };
}
