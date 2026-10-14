// The slice of expo-router a screen uses, for a test that renders one route
// component directly:
//
//   jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
//
// `setSearchParams` sets what `useLocalSearchParams` returns; `mockRouter`
// records navigation.
export const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};

let searchParams: Record<string, string> = {};

export function setSearchParams(params: Record<string, string>): void {
  searchParams = params;
}

export const expoRouterMock = {
  useRouter: () => mockRouter,
  useLocalSearchParams: () => searchParams,
  useGlobalSearchParams: () => searchParams,
  useFocusEffect: () => undefined,
  useNavigation: () => ({ setOptions: jest.fn(), addListener: jest.fn(() => () => undefined) }),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: unknown }) => children,
  router: mockRouter,
};
