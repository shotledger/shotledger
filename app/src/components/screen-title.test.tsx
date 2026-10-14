// One title per screen (#822): under a shown header the title goes into it;
// with no header the screen draws it, as its heading.
import { screen } from '@testing-library/react-native';
import { HeaderShownContext } from 'expo-router/react-navigation';

import { renderWithProviders } from '@/test-utils/render';
import { resetTestDb } from '@/test-utils/test-db-client';

import { ScreenTitle, headerTitleOf } from './screen-title';

const mockSetOptions = jest.fn();

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
jest.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

beforeEach(() => {
  mockSetOptions.mockClear();
  resetTestDb();
});

describe('ScreenTitle', () => {
  it('draws the title as the heading where no header is shown', async () => {
    await renderWithProviders(<ScreenTitle>Home</ScreenTitle>);

    expect(screen.getByRole('header', { name: 'Home' })).toBeOnTheScreen();
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it('hands the title to a shown header and draws nothing itself', async () => {
    await renderWithProviders(
      <HeaderShownContext.Provider value>
        <ScreenTitle>KM Precision C</ScreenTitle>
      </HeaderShownContext.Provider>,
    );

    expect(screen.queryByText('KM Precision C')).toBeNull();
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'KM Precision C' });
  });

  it('keeps a title that is not plain text in the body', () => {
    expect(headerTitleOf(['Session ', 3])).toBe('Session 3');
    expect(headerTitleOf(<></>)).toBeNull();
  });
});
