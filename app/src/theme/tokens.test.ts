import { Colors } from './tokens';

describe('theme tokens', () => {
  it('defines both light and dark palettes with the same keys', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });
});
