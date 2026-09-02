import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { listDocuments } from './vault-store';
import type { VaultDocumentMeta } from './types';

export function useVaultList(enabled: boolean) {
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    if (!enabled) return;
    listDocuments()
      .then((docs) => {
        setDocuments(docs);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [enabled]);

  useFocusEffect(refresh);

  return { documents, loaded, refresh };
}
