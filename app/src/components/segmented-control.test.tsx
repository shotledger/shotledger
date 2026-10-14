// The segmented control is a radio group: each segment is a radio that says
// whether it is the chosen one, and selection is a fill plus an outline.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState<(typeof OPTIONS)[number]['value']>('system');
  return (
    <SegmentedControl
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      testID="seg"
    />
  );
}

describe('SegmentedControl', () => {
  it('announces a radio group of radios', async () => {
    await renderWithProviders(<Harness />);
    expect(screen.getByTestId('seg').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('moves the selection on press', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
  });

  it('scrolls from four options, keeping the radio group', async () => {
    await renderWithProviders(
      <SegmentedControl
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' },
        ]}
        value="a"
        onChange={() => {}}
        testID="seg4"
      />,
    );
    expect(screen.getByTestId('seg4').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('keeps every segment at least 48dp tall', async () => {
    await renderWithProviders(<Harness />);
    const radio = screen.getByRole('radio', { name: 'Light' });
    const segment = radio.children[0];
    expect(typeof segment).not.toBe('string');
    if (typeof segment === 'string' || segment === undefined) return;
    expect(StyleSheet.flatten(segment.props.style).minHeight).toBe(48);
  });
});
