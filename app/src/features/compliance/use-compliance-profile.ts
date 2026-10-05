// M6 (§6.6): the shooter's chosen jurisdiction profile. 'none' hides all
// compliance UI — see Settings, Home, Firearms consumers. The variant is the
// case within that profile (for 'se': FAP 551-3 5 § vs 6 §): the shooter's
// explicit choice if they made one, otherwise derived from their firearms
// (issue #286).
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getProfile,
  getProfileDefinition,
  type FirearmOwnershipFact,
  type JurisdictionProfile,
  type ProfileSelection,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listFirearmOwnershipFacts } from '@/db/queries/firearms';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { resolveDefaultProfileSelection } from './profile';
import { resolveComplianceCase } from './resolve-case';

export interface ComplianceProfileState {
  selection: ProfileSelection;
  profile: JurisdictionProfile | null;
  /** The cases this profile offers, in display order; empty for 'none'. */
  variantIds: string[];
  /** Resolved case — the stored choice, else the derived default. */
  variantId: string | null;
  /** False when the case above was derived rather than chosen in Settings. */
  isVariantExplicit: boolean;
  /** Why it was derived; null when the shooter chose it themselves (#320). */
  variantReasonId: string | null;
  setSelection: (next: ProfileSelection) => void;
  setVariantId: (next: string) => void;
}

function loadSelection(locale: string): ProfileSelection {
  const stored = getSetting<ProfileSelection | null>(db, SETTINGS_KEYS.complianceProfile, null);
  return stored ?? resolveDefaultProfileSelection(locale);
}

function loadVariantId(): string | null {
  return getSetting<string | null>(db, SETTINGS_KEYS.complianceProfileVariant, null);
}

function loadOwnershipFacts(): FirearmOwnershipFact[] {
  return listFirearmOwnershipFacts(db);
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
  const [facts, setFacts] = useState<FirearmOwnershipFact[]>(loadOwnershipFacts);

  useFocusEffect(
    useCallback(() => {
      setSelectionState(loadSelection(i18n.language));
      setStoredVariantId(loadVariantId());
      // On focus too: marking a firearm as one's own moves the derived
      // default, and this screen may have been mounted before that edit.
      setFacts(loadOwnershipFacts());
    }, [i18n.language]),
  );

  const setSelection = useCallback((next: ProfileSelection) => {
    setSelectionState(next);
    setSetting<ProfileSelection>(db, SETTINGS_KEYS.complianceProfile, next);
  }, []);

  const setVariantId = useCallback((next: string) => {
    setStoredVariantId(next);
    setSetting<string>(db, SETTINGS_KEYS.complianceProfileVariant, next);
  }, []);

  // An unknown or unset stored id resolves to the derived default rather than
  // to "no requirement" — see resolveComplianceCase.
  const { variantId, isExplicit, reasonId } = resolveComplianceCase(
    selection,
    storedVariantId,
    facts,
  );
  const profile = getProfile(selection, variantId ?? undefined);

  return {
    selection,
    setSelection,
    profile,
    variantIds: getProfileDefinition(selection)?.variants.map((v) => v.id) ?? [],
    variantId: profile?.variantId ?? null,
    isVariantExplicit: isExplicit,
    variantReasonId: reasonId,
    setVariantId,
  };
}
