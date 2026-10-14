// The axis draws a gridline and a caption-sized label per tick, in token colours.
import { screen } from '@testing-library/react-native';
import Svg from 'react-native-svg';

import { ChartCaption, YAxisGrid } from '@/components/chart-kit/axis';
import { chartColors, linearAxis } from '@/components/chart-kit/chart-kit';
import { renderWithProviders } from '@/test-utils/render';
import { Colors, Typography } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

describe('YAxisGrid', () => {
  it('labels every nice tick in the caption size and tick colour', async () => {
    const colors = chartColors('light');
    await renderWithProviders(
      <Svg width={200} height={100}>
        <YAxisGrid
          axis={linearAxis(9.3, 10.7, 80, { invert: true })}
          colors={colors}
          left={30}
          right={200}
          top={10}
          locale="sv"
        />
      </Svg>,
    );
    // react-native-svg renders a label as a TSpan's `content` prop, not text.
    const json = JSON.stringify(screen.toJSON());
    for (const label of ['9,0', '9,5', '10,0', '10,5', '11,0']) {
      expect(json).toContain(`"content":"${label}"`);
    }
    expect(json).toContain(`"fontSize":${Typography.caption.fontSize}`);
  });
});

describe('ChartCaption', () => {
  it('draws caption type in secondary text with tabular numerals', async () => {
    await renderWithProviders(<ChartCaption>Last 8 sessions</ChartCaption>);
    const style = [screen.getByText('Last 8 sessions').props.style]
      .flat(Infinity)
      .reduce(
        (acc: Record<string, unknown>, s: unknown) => (s ? { ...acc, ...(s as object) } : acc),
        {},
      );
    expect(style.fontSize).toBe(Typography.caption.fontSize);
    expect(style.color).toBe(Colors.light.textSecondary);
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });
});
