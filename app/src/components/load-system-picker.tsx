// Laddsystem field: presets only, no free text.
//
// The column holds a language-neutral code (`semi_automatic`); the label comes
// from i18n, so a firearm entered in Swedish reads correctly in English. A
// pre-migration value the backfill could not read is shown verbatim as an
// extra pill so it is visible and replaceable rather than silently dropped.
import { LOAD_SYSTEM_CODES, isLoadSystemCode } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';

import { OptionPicker, type PickerOption } from '@/components/option-picker';

/** The "Not set" pill. `load_system` is optional, so clearing it must stay possible. */
const UNSET = '';

export interface LoadSystemPickerProps {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export function LoadSystemPicker({ label, value, onChange }: LoadSystemPickerProps) {
  const { t } = useTranslation();

  const options: PickerOption<string>[] = [
    { value: UNSET, label: t('firearms.loadSystemUnset'), testID: 'load-system-unset' },
    ...LOAD_SYSTEM_CODES.map((code) => ({
      value: code as string,
      label: t(`firearms.loadSystems.${code}`),
      testID: `load-system-${code}`,
    })),
  ];
  if (value && !isLoadSystemCode(value)) {
    options.push({ value, label: value, testID: 'load-system-legacy' });
  }

  return (
    <OptionPicker
      label={label}
      options={options}
      value={value ?? UNSET}
      onChange={(next) => onChange(next === UNSET ? null : next)}
    />
  );
}
