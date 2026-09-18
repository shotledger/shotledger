// The firearm-ownership field (issue #286). A plain boolean, "My Own"
// preselected (maintainer, 2026-09-18) — the app assumes a firearm on file is
// the shooter's own until they say otherwise.
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';

const OWN = 'own';
const BORROWED = 'borrowed';

export interface OwnershipPickerProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function OwnershipPicker({ value, onChange }: OwnershipPickerProps) {
  const { t } = useTranslation();
  return (
    <>
      <ThemedText type="smallBold">{t('firearms.ownership')}</ThemedText>
      <SegmentedControl
        options={[
          { value: OWN, label: t('firearms.ownershipOwn') },
          { value: BORROWED, label: t('firearms.ownershipBorrowed') },
        ]}
        value={value ? OWN : BORROWED}
        onChange={(next) => onChange(next === OWN)}
        testID="firearm-ownership"
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('firearms.ownershipHelp')}
      </ThemedText>
    </>
  );
}
