// The screen's one heading: a header role, the title type, and room for one
// trailing action.
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Header } from '@/components/header';
import { renderWithProviders } from '@/test-utils/render';
import { Typography } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

describe('Header', () => {
  it('is the one header, in the title type', async () => {
    await renderWithProviders(<Header title="Statistics" subtitle="Training · 6 series" />);
    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Statistics');
    const style = StyleSheet.flatten(headers[0]!.props.style);
    expect(style.fontSize).toBe(Typography.title.fontSize);
    expect(style.lineHeight).toBe(Typography.title.lineHeight);
    expect(style.fontWeight).toBe(Typography.title.fontWeight);
    expect(screen.getByText('Training · 6 series')).toBeTruthy();
  });

  it('draws a trailing action and no subtitle when none is given', async () => {
    await renderWithProviders(
      <Header
        title="Firearms"
        trailing={<Button variant="text" label="Edit" onPress={() => {}} />}
      />,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByText('Training · 6 series')).toBeNull();
  });
});
