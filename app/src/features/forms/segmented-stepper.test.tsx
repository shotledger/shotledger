// The station counters' stepper (#822): 48dp cells, a value that reads with
// its field name, and buttons that stop at either end of the options.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { SegmentedStepper } from '@/features/forms/segmented-stepper';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const OPTIONS = [
  { value: 'none', label: '–' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedStepper
      options={OPTIONS}
      value={value}
      onChange={setValue}
      label="Figures"
      decrementLabel="Figures, decrease"
      incrementLabel="Figures, increase"
      testID="step"
    />
  );
}

describe('SegmentedStepper', () => {
  it('steps through the options and stops at both ends', async () => {
    await renderWithProviders(<Harness initial="none" />);
    const down = screen.getByRole('button', { name: 'Figures, decrease' });
    const up = screen.getByRole('button', { name: 'Figures, increase' });
    expect(screen.getByLabelText('Figures, –')).toBeOnTheScreen();
    expect(down).toBeDisabled();

    await fireEvent.press(up);
    await fireEvent.press(up);
    expect(screen.getByTestId('step-value')).toHaveTextContent('2');
    expect(up).toBeDisabled();

    await fireEvent.press(down);
    expect(screen.getByLabelText('Figures, 1')).toBeOnTheScreen();
  });

  it('keeps every cell at least 48dp', async () => {
    await renderWithProviders(<Harness initial="1" />);
    for (const id of ['step-decrement', 'step-value', 'step-increment']) {
      const style = StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(style.minHeight).toBe(48);
    }
    const button = StyleSheet.flatten(screen.getByTestId('step-increment').props.style);
    expect(button.minWidth).toBe(48);
  });
});
