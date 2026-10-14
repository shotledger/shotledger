// The station counts' one-tap picker (#822): a radio group of 48dp cells,
// option testIDs for the e2e flows, and fill plus outline for the choice.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { CountCells } from '@/features/forms/count-cells';
import { renderWithProviders } from '@/test-utils/render';
import { Colors } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const OPTIONS = ['none', '1', '2', '3'].map((value) => ({
  value,
  label: value === 'none' ? '–' : value,
}));

function Harness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('none');
  return (
    <CountCells
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      label="Figures"
      testID="count"
    />
  );
}

describe('CountCells', () => {
  it('is a radio group, one tap per value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness onChange={onChange} />);
    expect(screen.getByTestId('count').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByTestId('count-none')).toBeSelected();

    await fireEvent.press(screen.getByTestId('count-3'));
    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.getByRole('radio', { name: 'Figures 3' })).toBeChecked();
    expect(screen.getByTestId('count-none')).not.toBeSelected();
  });

  it('keeps cells at least 48dp and marks the choice with fill and outline', async () => {
    await renderWithProviders(<Harness />);
    const on = StyleSheet.flatten(screen.getByTestId('count-none').props.style);
    const off = StyleSheet.flatten(screen.getByTestId('count-2').props.style);
    expect(on.minHeight).toBe(48);
    expect(on.minWidth).toBe(48);
    expect(on.backgroundColor).toBe(Colors.light.selected);
    expect(on.borderColor).toBe(Colors.light.selectedOutline);
    expect(on.borderWidth).toBe(off.borderWidth);
  });
});
