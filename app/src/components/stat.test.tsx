// Stat never truncates: no line limit on any of its text, and the value,
// unit and label read as one phrase.
import { screen } from '@testing-library/react-native';

import { Stat } from '@/components/stat';
import { renderWithProviders } from '@/test-utils/render';
import { Typography } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

describe('Stat', () => {
  it('sets no line limit on any text, so nothing is cut', async () => {
    await renderWithProviders(
      <Stat label="Competitions Entered This Season" value="1 284 567" unit="rounds" />,
    );
    const texts = ['1 284 567', 'rounds', 'Competitions Entered This Season'].map((t) =>
      screen.getByText(t),
    );
    for (const text of texts) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    }
  });

  it('reads value, unit and label as one phrase', async () => {
    await renderWithProviders(<Stat label="Shots Logged" value="1 284" unit="rounds" testID="s" />);
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('1 284 rounds Shots Logged');
    expect(screen.getByLabelText('1 284 rounds Shots Logged')).toBeTruthy();
  });

  it('omits a missing unit from the phrase', async () => {
    await renderWithProviders(<Stat label="Sessions" value="42" bare testID="s" />);
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('42 Sessions');
  });

  it.each([
    ['headline', Typography.headline.fontSize],
    ['score', Typography.score.fontSize],
  ] as const)('draws a %s value in tabular numerals', async (size, fontSize) => {
    await renderWithProviders(<Stat label="Total" value="587" size={size} />);
    const style = [screen.getByText('587').props.style]
      .flat(Infinity)
      .reduce(
        (acc: Record<string, unknown>, s: unknown) => (s ? { ...acc, ...(s as object) } : acc),
        {},
      );
    expect(style.fontSize).toBe(fontSize);
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });
});
