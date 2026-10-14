// A licence status in words, coloured by its semantic token, never colour alone.
import { screen } from '@testing-library/react-native';
import type { LicenseStatus } from '@shotledger/shared';
import { StyleSheet } from 'react-native';

import { STATUS_LINE_KEY, STATUS_LINE_TONE, StatusLine } from '@/components/status-line';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { Colors } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const CASES: [LicenseStatus, string, keyof typeof Colors.light][] = [
  ['valid', 'Valid', 'success'],
  ['expiringSoon', 'Expiring Soon', 'warning'],
  ['expired', 'Expired', 'danger'],
  ['none', 'No License', 'textSecondary'],
];

describe('StatusLine', () => {
  it.each(CASES)('says %s in words, in its tone', async (status, words, tone) => {
    await renderWithProviders(<StatusLine status={status} testID="line" />);
    const text = screen.getByText(words);
    expect(StyleSheet.flatten(text.props.style).color).toBe(Colors.light[tone]);
    expect(STATUS_LINE_TONE[status]).toBe(tone);
    expect(screen.getByTestId('line').props.accessibilityLabel).toBe(words);
  });

  it('adds the detail after the words, for the screen reader too', async () => {
    await renderWithProviders(
      <StatusLine status="expiringSoon" detail="until 2026-11-30" testID="line" />,
    );
    expect(screen.getByText('until 2026-11-30')).toBeTruthy();
    expect(screen.getByTestId('line').props.accessibilityLabel).toBe(
      'Expiring Soon, until 2026-11-30',
    );
  });

  it('has Swedish words for every status', () => {
    const sv = i18n.getFixedT('sv');
    for (const key of Object.values(STATUS_LINE_KEY)) {
      expect(sv(key)).not.toBe(key);
    }
  });
});
