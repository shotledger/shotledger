// The filter bar: a Filters button that counts what is active and opens the
// sheet, a removable chip per active filter, and Clear All in the sheet.
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { FilterBar, filterButtonLabel } from '@/components/filter-bar';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const FILTERS = [
  { key: 'training', label: 'Training' },
  { key: 'pistol', label: 'Pistol' },
];

function setup(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  const props = {
    filters: FILTERS,
    onRemove: jest.fn(),
    sheetOpen: false,
    onOpenSheet: jest.fn(),
    onCloseSheet: jest.fn(),
    onClearAll: jest.fn(),
    testID: 'bar',
    ...overrides,
  };
  return {
    props,
    ui: (
      <FilterBar {...props}>
        <Text>Sheet body</Text>
      </FilterBar>
    ),
  };
}

describe('filterButtonLabel', () => {
  it('counts active filters, and says plain Filters with none', () => {
    const t = i18n.getFixedT('en');
    expect(filterButtonLabel(t, 0)).toBe('Filters');
    expect(filterButtonLabel(t, 2)).toBe('Filters (2)');
    expect(filterButtonLabel(i18n.getFixedT('sv'), 1)).toBe('Filter (1)');
  });
});

describe('FilterBar', () => {
  it('opens the sheet from the Filters button', async () => {
    const { props, ui } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Filters (2)' }));
    expect(props.onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it('removes a filter from its chip, named for a screen reader', async () => {
    const { props, ui } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter Pistol' }));
    expect(props.onRemove).toHaveBeenCalledWith('pistol');
  });

  it('keeps every chip at least 48dp tall', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    const chip = screen.getByRole('button', { name: 'Remove filter Training' });
    expect(
      [chip.props.style].flat().find((s: { minHeight?: number }) => s?.minHeight)?.minHeight,
    ).toBe(48);
  });

  it('shows the sheet body, Clear All and Close when open', async () => {
    const { props, ui } = setup({ sheetOpen: true });
    await renderWithProviders(ui);
    expect(screen.getByText('Sheet body')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear All' }));
    expect(props.onClearAll).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(props.onCloseSheet).toHaveBeenCalledTimes(1);
  });

  it('hides Clear All when nothing is active', async () => {
    const { ui } = setup({ sheetOpen: true, filters: [] });
    await renderWithProviders(ui);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear All' })).toBeNull();
  });
});
