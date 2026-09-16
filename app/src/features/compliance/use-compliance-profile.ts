// M6 (§6.6): the shooter's chosen jurisdiction profile. 'none' hides all
// compliance UI — see Settings, Home, Firearms consumers. The variant is the
// case within that profile (for 'se': FAP 551-3 5 § vs 6 §), which the app
// cannot derive and so must be told.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getProfile,
  getProfileDefinition,
  type JurisdictionProfile,
  type ProfileSelection,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { resolveDefaultProfileSelection } from './profile';

export interface ComplianceProfileState {
  selection: ProfileSelection;
  profile: JurisdictionProfile | null;
  /** The cases this profile offers, in display order; empty for 'none'. */
  variantIds: string[];
  /** Resolved case — the stored choice, else the profile's default. */
  variantId: string | null;
  setSelection: (next: ProfileSelection) => void;
  setVariantId: (next: string) => void;
}

function loadSelection(locale: string): ProfileSelection {
  if (!db) return 'none';
  const stored = getSetting<ProfileSelection | null>(db, SETTINGS_KEYS.complianceProfile, null);
  return stored ?? resolveDefaultProfileSelection(locale);
}

function loadVariantId(): string | null {
  if (!db) return null;
  return getSetting<string | null>(db, SETTINGS_KEYS.complianceProfileVariant, null);
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
  const [storedVariantId, setStoredVariantId] = useState<string | null>(loadVariantId);

  useFocusEffect(
    useCallback(() => {
      setSelectionState(loadSelection(i18n.language));
      setStoredVariantId(loadVariantId());
    }, [i18n.language]),
  );

  const setSelection = useCallback((next: ProfileSelection) => {
    setSelectionState(next);
    if (db) setSetting<ProfileSelection>(db, SETTINGS_KEYS.complianceProfile, next);
  }, []);

  const setVariantId = useCallback((next: string) => {
    setStoredVariantId(next);
    if (db) setSetting<string>(db, SETTINGS_KEYS.complianceProfileVariant, next);
  }, []);

  // An unknown or unset stored id resolves to the profile's default rather
  // than to "no requirement" — see getProfile.
  const profile = getProfile(selection, storedVariantId ?? undefined);

  return {
    selection,
    setSelection,
    profile,
    variantIds: getProfileDefinition(selection)?.variants.map((v) => v.id) ?? [],
    variantId: profile?.variantId ?? null,
    setVariantId,
  };
}
