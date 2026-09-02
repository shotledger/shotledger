// M6 (§6.6): the shooter's chosen jurisdiction profile. 'none' hides all
// compliance UI — see Settings, Home, Firearms consumers.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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

function loadSelection(locale: string): ProfileSelection {
  if (!db) return 'none';
  const stored = getSetting<ProfileSelection | null>(db, SETTINGS_KEYS.complianceProfile, null);
  return stored ?? resolveDefaultProfileSelection(locale);
}

/**
 * Refetches on focus (like every other M2+ data hook) rather than only on
 * mount — Settings writes the choice to the same DB row a screen mounted
 * earlier already read, so a one-shot useState would go stale across tabs.
 */
export function useComplianceProfile(): ComplianceProfileState {
  const { i18n } = useTranslation();
  const [selection, setSelectionState] = useState<ProfileSelection>(() =>
    loadSelection(i18n.language),
  );

  useFocusEffect(
    useCallback(() => {
      setSelectionState(loadSelection(i18n.language));
    }, [i18n.language]),
  );

  const setSelection = useCallback((next: ProfileSelection) => {
    setSelectionState(next);
    if (db) setSetting<ProfileSelection>(db, SETTINGS_KEYS.complianceProfile, next);
  }, []);

  return { selection, setSelection, profile: getProfile(selection) };
}
