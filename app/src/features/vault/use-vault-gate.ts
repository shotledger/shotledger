// Drives the biometric/passcode gate shown before the vault list renders.
import { useCallback, useState } from 'react';

import { requestVaultAccess } from '@/platform/vault-auth';

export type VaultGateState =
  | { status: 'locked' }
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'unlocked'; deviceUnsecured: boolean };

export function useVaultGate(promptMessage: string) {
  const [state, setState] = useState<VaultGateState>({ status: 'locked' });

  const unlock = useCallback(async () => {
    setState({ status: 'checking' });
    const result = await requestVaultAccess(promptMessage);
    setState(
      result.granted
        ? { status: 'unlocked', deviceUnsecured: result.deviceUnsecured }
        : { status: 'denied' },
    );
  }, [promptMessage]);

  return { state, unlock };
}
