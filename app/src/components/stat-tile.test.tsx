// Home's stat tiles truncated their captions ("Shots Log…", "Competiti…").
// A caption now wraps between words and shrinks only while one word is wider
// than the tile, so it never truncates and never splits mid-word (#823).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { StatTile } from './stat-tile';

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => jest.requireActual('@/theme/tokens').Colors.light,
  useResolvedThemeName: () => 'light',
}));

function fontSizeOf(text: string): number | undefined {
  return StyleSheet.flatten(screen.getByText(text).props.style)?.fontSize;
}

async function layOut(text: string, lines: string[]) {
  await fireEvent(screen.getByText(text), 'textLayout', {
    nativeEvent: { lines: lines.map((line) => ({ text: line })) },
  });
}

describe('StatTile', () => {
  it('lets the caption wrap: no line limit, no ellipsis', async () => {
    await render(<StatTile label="Shots Logged" value="112" />);
    const caption = screen.getByText('Shots Logged');
    expect(caption.props.numberOfLines).toBeUndefined();
    expect(caption.props.ellipsizeMode).toBeUndefined();
  });

  it('keeps the value on one line, shrinking it to fit', async () => {
    await render(<StatTile label="Sessions" value="12 840" />);
    const value = screen.getByText('12 840');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  it('leaves a caption that breaks between words at full size', async () => {
    await render(<StatTile label="Shots Logged" value="112" />);
    await act(() => layOut('Shots Logged', ['Shots ', 'Logged']));
    expect(fontSizeOf('Shots Logged')).toBe(14);
  });

  it('shrinks a caption whose one word splits, down to the minimum and no further', async () => {
    await render(<StatTile label="Competitions" value="1" />);
    await act(() => layOut('Competitions', ['Competiti', 'ons']));
    expect(fontSizeOf('Competitions')).toBeCloseTo(14 * 0.95);
    await act(() => layOut('Competitions', ['Competitio', 'ns']));
    expect(fontSizeOf('Competitions')).toBeCloseTo(14 * 0.9);
    for (let i = 0; i < 10; i++) {
      await act(() => layOut('Competitions', ['Competitio', 'ns']));
    }
    expect(fontSizeOf('Competitions')).toBeCloseTo(14 * 0.75);
    await act(() => layOut('Competitions', ['Competitions']));
    expect(fontSizeOf('Competitions')).toBeCloseTo(14 * 0.75);
  });

  it('starts again from full size when the label changes', async () => {
    const { rerender } = await render(<StatTile label="Competitions" value="1" />);
    await act(() => layOut('Competitions', ['Competiti', 'ons']));
    expect(fontSizeOf('Competitions')).toBeCloseTo(14 * 0.95);
    await rerender(<StatTile label="Tävlingar" value="1" />);
    expect(fontSizeOf('Tävlingar')).toBe(14);
  });
});
