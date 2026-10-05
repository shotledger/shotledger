// Caliber field: presets only, this shooter's most-used first.
//
// A plain `SearchablePicker` — the same filterable dropdown the 91-option
// birth-year list uses — over `listCaliberOptions`. There is no free-text
// entry: a caliber the vocabulary does not have has to be added to
// `shared/src/calibers/presets.ts`.
import { isCaliberPreset } from '@shotledger/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SearchablePicker, type SearchablePickerOption } from '@/components/searchable-picker';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listCaliberOptions } from '@/db/queries/caliber-usage';

export interface CaliberPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  testID?: string;
}

export function CaliberPicker({ label, value, onChange, testID }: CaliberPickerProps) {
  const { t } = useTranslation();

  const options = useMemo<SearchablePickerOption<string>[]>(() => {
    const names = listCaliberOptions(db).map((option) => option.name);
    // A pre-presets value the migration could not read stays selectable.
    if (value && !names.includes(value)) names.unshift(value);
    return names.map((name) => ({ value: name, label: name, testID: `caliber-option-${name}` }));
  }, [value]);

  return (
    <>
      <SearchablePicker
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={t('common.caliberPlaceholder')}
        searchPlaceholder={t('common.caliberSearchPlaceholder')}
        emptyLabel={t('common.caliberNoMatch')}
        clearable
        clearLabel={t('common.clear')}
        onClear={() => onChange(null)}
        testID={testID ?? 'caliber'}
      />
      {value !== null && !isCaliberPreset(value) ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.caliberLegacyHint')}
        </ThemedText>
      ) : null}
    </>
  );
}
