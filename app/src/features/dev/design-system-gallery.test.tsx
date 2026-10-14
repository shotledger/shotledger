// The /dev/components design-system block renders every #822 component, and
// its theme switch flips the whole app between light and dark.
import { fireEvent, screen } from '@testing-library/react-native';

import { DesignSystemGallery } from '@/features/dev/design-system-gallery';
import { renderWithProviders } from '@/test-utils/render';
import { resetTestDb } from '@/test-utils/test-db-client';
import { Colors } from '@/theme/tokens';
import { StyleSheet } from 'react-native';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

beforeEach(() => {
  resetTestDb();
});

describe('DesignSystemGallery', () => {
  it('shows every component section', async () => {
    await renderWithProviders(<DesignSystemGallery />);
    for (const title of [
      'Header',
      'Type Scale',
      'Buttons',
      'Segmented',
      'Choice Chips',
      'Shot Cells',
      'Stat',
      'Filter Bar',
      'Chart Kit',
      'Status Line',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it('switches the theme from the page', async () => {
    await renderWithProviders(<DesignSystemGallery />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    const shot = screen.getByRole('button', { name: 'Shot 4: not entered' });
    expect(StyleSheet.flatten(shot.props.style).borderColor).toBe(Colors.dark.selectedOutline);

    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    const again = screen.getByRole('button', { name: 'Shot 4: not entered' });
    expect(StyleSheet.flatten(again.props.style).borderColor).toBe(Colors.light.selectedOutline);
  });

  it('drives its demos: shot cell, chips and the filter bar', async () => {
    await renderWithProviders(<DesignSystemGallery />);
    await fireEvent.press(screen.getByRole('button', { name: 'Shot 1: inner ten, 10' }));
    expect(screen.getByRole('button', { name: 'Shot 1: inner ten, 10' })).toBeSelected();

    await fireEvent.press(screen.getAllByRole('radio', { name: 'Women' })[0]!);
    expect(screen.getAllByRole('radio', { name: 'Women' })[0]).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter Competition' }));
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Training' }));
    expect(screen.getByRole('button', { name: 'Remove filter Training' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear All' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Remove filter Training' })).toBeNull();
  });
});
