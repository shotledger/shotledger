// The firearm-ownership field (issue #286). Three states, not two: "not
// specified" is the state every firearm recorded before the column existed is
// in, and it has to be reachable so a shooter can take a statement back.
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';

export type OwnershipChoice = 'own' | 'borrowed' | 'unstated';

export function ownershipToIsOwn(choice: OwnershipChoice): boolean | null {
  if (choice === 'own') return true;
  if (choice === 'borrowed') return false;
  return null;
}

export function isOwnToOwnership(isOwn: boolean | null | undefined): OwnershipChoice {
  if (isOwn === true) return 'own';
  if (isOwn === false) return 'borrowed';
  return 'unstated';
}

const CHOICES: OwnershipChoice[] = ['own', 'borrowed', 'unstated'];

export interface OwnershipPickerProps {
  value: OwnershipChoice;
  onChange: (value: OwnershipChoice) => void;
}

export function OwnershipPicker({ value, onChange }: OwnershipPickerProps) {
  const { t } = useTranslation();
  return (
    <>
      <ThemedText type="smallBold">{t('firearms.ownership')}</ThemedText>
      <SegmentedControl
        options={CHOICES.map((choice) => ({
          value: choice,
          label: t(`firearms.ownership${choice.charAt(0).toUpperCase()}${choice.slice(1)}`),
        }))}
        value={value}
        onChange={onChange}
        testID="firearm-ownership"
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('firearms.ownershipHelp')}
      </ThemedText>
    </>
  );
}
