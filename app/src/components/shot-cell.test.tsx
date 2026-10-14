// A shot cell: 48dp, named by its position and value, the current one
// outlined and announced as selected.
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ShotCell } from '@/components/shot-cell';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { Colors } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

describe('ShotCell', () => {
  it('names an entered shot by position and value', async () => {
    await renderWithProviders(
      <ShotCell
        shot={{ valueTenths: 90, isInnerTen: false }}
        mode="integer"
        index={1}
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Shot 2: 9' })).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('says an empty cell is not entered and shows a dash', async () => {
    await renderWithProviders(<ShotCell shot={null} mode="integer" index={0} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Shot 1: not entered' })).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('spells out an inner ten rather than reading "X"', async () => {
    await renderWithProviders(
      <ShotCell
        shot={{ valueTenths: 100, isInnerTen: true }}
        mode="integer"
        index={0}
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Shot 1: inner ten, 10' })).toBeTruthy();
    expect(screen.getByText('X')).toBeTruthy();
  });

  it('keeps the decimal in decimal mode', async () => {
    await renderWithProviders(
      <ShotCell
        shot={{ valueTenths: 104, isInnerTen: true }}
        mode="decimal"
        index={2}
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Shot 3: inner ten, 10.4' })).toBeTruthy();
    expect(screen.getByText('(10.4)')).toBeTruthy();
  });

  it('outlines the current cell and announces it as selected', async () => {
    await renderWithProviders(
      <>
        <ShotCell shot={null} mode="integer" index={0} current onPress={() => {}} />
        <ShotCell shot={null} mode="integer" index={1} onPress={() => {}} />
      </>,
    );
    const current = screen.getByRole('button', { name: 'Shot 1: not entered' });
    const other = screen.getByRole('button', { name: 'Shot 2: not entered' });
    expect(current).toBeSelected();
    expect(other).not.toBeSelected();
    const on = StyleSheet.flatten(current.props.style);
    const off = StyleSheet.flatten(other.props.style);
    expect(on.borderColor).toBe(Colors.light.selectedOutline);
    expect(on.backgroundColor).toBe(Colors.light.selected);
    expect(off.borderColor).toBe(Colors.light.border);
    expect(on.borderWidth).toBe(off.borderWidth);
    expect(on.minHeight).toBe(48);
    expect(on.minWidth).toBe(48);
  });

  it('reports a press', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<ShotCell shot={null} mode="integer" index={0} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a labelled, non-interactive cell without onPress', async () => {
    await renderWithProviders(<ShotCell shot={null} mode="integer" index={4} testID="cell" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Shot 5: not entered')).toBeTruthy();
  });

  it('has a Swedish label for every case', () => {
    const sv = i18n.getFixedT('sv');
    expect(sv('components.shotCellEmpty', { number: 1 })).toBe('Skott 1: inte inmatat');
    expect(sv('components.shotCell', { number: 2, value: '9' })).toBe('Skott 2: 9');
    expect(sv('components.shotCellInnerTen', { number: 3, value: '10' })).toBe(
      'Skott 3: innertia, 10',
    );
  });
});
