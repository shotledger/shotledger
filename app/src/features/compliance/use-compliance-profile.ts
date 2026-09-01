// M6 (§6.6): the shooter's chosen jurisdiction profile. 'none' hides all
// compliance UI — see Settings, Home, Firearms consumers.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProfile, type JurisdictionProfile, type ProfileSelection } from '@shotledger/shared';

import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { resolveDefaultProfileSelection } from './profile';

export interface ComplianceProfileState {
  selection: ProfileSelection;
  profile: JurisdictionProfile | null;
  setSelection: (next: ProfileSelection) => void;
}

export function useComplianceProfile(): ComplianceProfileState {
  const { i18n } = useTranslation();
  const [selection, setSelectionState] = useState<ProfileSelection>(() => {
    if (!db) return 'none';
    const stored = getSetting<ProfileSelection | null>(db, SETTINGS_KEYS.complianceProfile, null);
    return stored ?? resolveDefaultProfileSelection(i18n.language);
  });

  const setSelection = useCallback((next: ProfileSelection) => {
    setSelectionState(next);
    if (db) setSetting<ProfileSelection>(db, SETTINGS_KEYS.complianceProfile, next);
  }, []);

  return { selection, setSelection, profile: getProfile(selection) };
}
