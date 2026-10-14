// Choice Chips: the selection rule (single acts as a radio group, multi
// toggles in display order) and what a screen reader is told about each chip.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { toggleChoice } from '@/components/choice-chips-logic';
import { renderWithProviders } from '@/test-utils/render';
import { Colors } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const ORDER = ['a', 'b', 'c'] as const;
type V = (typeof ORDER)[number];
const OPTIONS = ORDER.map((value) => ({ value, label: value.toUpperCase() }));

describe('toggleChoice', () => {
  it('replaces the choice in single mode', () => {
    expect(toggleChoice<V>(['a'], 'b', 'single', ORDER)).toEqual(['b']);
  });

  it('keeps the chosen chip chosen when tapped again in single mode', () => {
    expect(toggleChoice<V>(['a'], 'a', 'single', ORDER)).toEqual(['a']);
  });

  it('adds and removes in multi mode', () => {
    expect(toggleChoice<V>(['a'], 'c', 'multi', ORDER)).toEqual(['a', 'c']);
    expect(toggleChoice<V>(['a', 'c'], 'a', 'multi', ORDER)).toEqual(['c']);
    expect(toggleChoice<V>(['a'], 'a', 'multi', ORDER)).toEqual([]);
  });

  it('returns a multi selection in display order, whatever the tap order', () => {
    expect(toggleChoice<V>(['c'], 'a', 'multi', ORDER)).toEqual(['a', 'c']);
  });
});

function Harness({ mode, initial }: { mode: 'single' | 'multi'; initial: V[] }) {
  const [value, setValue] = useState<V[]>(initial);
  return (
    <ChoiceChips
      options={OPTIONS}
      value={value}
      onChange={setValue}
      mode={mode}
      accessibilityLabel="Letters"
      testID="chips"
    />
  );
}

describe('ChoiceChips', () => {
  it('is a radio group of radios in single mode', async () => {
    await renderWithProviders(<Harness mode="single" initial={['a']} />);
    expect(screen.getByTestId('chips').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B' })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
  });

  it('is a set of checkboxes in multi mode', async () => {
    await renderWithProviders(<Harness mode="multi" initial={['a']} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'C' }));
    expect(screen.getByRole('checkbox', { name: 'A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'C' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'A' }));
    expect(screen.getByRole('checkbox', { name: 'A' })).not.toBeChecked();
  });

  it('shows selection as fill plus outline, at the same border width', async () => {
    await renderWithProviders(<Harness mode="single" initial={['a']} />);
    const on = StyleSheet.flatten(screen.getByRole('radio', { name: 'A' }).props.style);
    const off = StyleSheet.flatten(screen.getByRole('radio', { name: 'B' }).props.style);
    expect(on.backgroundColor).toBe(Colors.light.selected);
    expect(on.borderColor).toBe(Colors.light.selectedOutline);
    expect(off.borderColor).toBe(Colors.light.border);
    expect(on.borderWidth).toBe(off.borderWidth);
    expect(on.minHeight).toBe(48);
  });
});
