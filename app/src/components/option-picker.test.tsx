// OptionPicker and MultiOptionPicker draw through the two shared choice
// controls (#822): Segmented for a few short options, Choice Chips otherwise.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { MultiOptionPicker } from '@/components/multi-option-picker';
import { OptionPicker } from '@/components/option-picker';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const SHORT = [
  { value: 'a', label: 'A', testID: 'pick-a' },
  { value: 'b', label: 'B', testID: 'pick-b' },
  { value: 'c', label: 'C', testID: 'pick-c' },
];

const MANY = ['Club', 'District', 'Region', 'National', 'International'].map((label) => ({
  value: label.toLowerCase(),
  label,
  testID: `level-${label.toLowerCase()}`,
}));

function Single({ options, initial }: { options: typeof SHORT; initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return <OptionPicker label="Pick" options={options} value={value} onChange={setValue} />;
}

describe('OptionPicker', () => {
  it('draws a few short options as one segmented radio group', async () => {
    await renderWithProviders(<Single options={SHORT} initial="a" />);
    expect(screen.getByText('Pick')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByLabelText('Pick').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByTestId('pick-a')).toBeSelected();

    await fireEvent.press(screen.getByTestId('pick-c'));
    expect(screen.getByTestId('pick-c')).toBeSelected();
    expect(screen.getByTestId('pick-a')).not.toBeSelected();
  });

  it('draws many options as single-select chips', async () => {
    await renderWithProviders(<Single options={MANY} initial={null} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const option of MANY) expect(screen.getByTestId(option.testID)).not.toBeSelected();

    await fireEvent.press(screen.getByTestId('level-region'));
    expect(screen.getByTestId('level-region')).toBeChecked();
    // Tapping the chosen chip keeps it chosen, as a radio does.
    await fireEvent.press(screen.getByTestId('level-region'));
    expect(screen.getByTestId('level-region')).toBeChecked();
  });

  it('shows nothing selected while the value is null', async () => {
    await renderWithProviders(<Single options={SHORT} initial={null} />);
    for (const option of SHORT) expect(screen.getByTestId(option.testID)).not.toBeSelected();
  });

  it('shows the empty label instead of an empty control', async () => {
    await renderWithProviders(
      <OptionPicker label="Pick" options={[]} value={null} onChange={() => {}} emptyLabel="None" />,
    );
    expect(screen.getByText('None')).toBeOnTheScreen();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('MultiOptionPicker', () => {
  it('toggles the one tapped value through checkbox chips', async () => {
    const onToggle = jest.fn();
    await renderWithProviders(
      <MultiOptionPicker
        options={[
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ]}
        values={['x']}
        onToggle={onToggle}
        testID="tags"
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'X' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Y' })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Y' }));
    expect(onToggle).toHaveBeenLastCalledWith('y');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'X' }));
    expect(onToggle).toHaveBeenLastCalledWith('x');
  });
});
