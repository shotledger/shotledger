// The button tiers: every tier is a 48dp button with its label as its name,
// presses reach the handler, and disabled is announced and inert.
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button, tonalColors, type ButtonVariant } from '@/components/button';
import { renderWithProviders } from '@/test-utils/render';
import { Colors } from '@/theme/tokens';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'tonal', 'text', 'destructive'];

describe('tonalColors', () => {
  it('fills tonal with the selected token and a text-coloured label', () => {
    expect(tonalColors(false)).toEqual({ background: 'selected', label: 'text' });
  });

  it('drops a disabled tonal to secondary text on no fill', () => {
    expect(tonalColors(true)).toEqual({ background: null, label: 'textSecondary' });
  });
});

describe('Button', () => {
  it.each(VARIANTS)('renders %s as a 48dp button named by its label', async (variant) => {
    const onPress = jest.fn();
    await renderWithProviders(<Button variant={variant} label="Go" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Go' });
    const style = StyleSheet.flatten(
      typeof button.props.style === 'function'
        ? button.props.style({ pressed: false })
        : button.props.style,
    );
    expect(style.minHeight).toBe(48);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(VARIANTS)('announces a disabled %s and ignores presses', async (variant) => {
    const onPress = jest.fn();
    await renderWithProviders(<Button variant={variant} label="Go" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('defaults to the secondary tier', async () => {
    await renderWithProviders(<Button label="Go" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Go' }).props.style);
    expect(style.borderWidth).toBe(1);
  });

  it('draws destructive in the danger colour, never the accent', async () => {
    await renderWithProviders(<Button variant="destructive" label="Delete" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Delete' }).props.style);
    expect(style.borderColor).toBe(Colors.light.danger);
  });

  it('draws text as the accent label on no fill', async () => {
    await renderWithProviders(<Button variant="text" label="Add" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Add' }).props.style);
    expect(style.backgroundColor).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByText('Add').props.style).color).toBe(
      Colors.light.primary,
    );
  });

  it('fills tonal with the selected token', async () => {
    await renderWithProviders(<Button variant="tonal" label="Add" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Add' }).props.style);
    expect(style.backgroundColor).toBe(Colors.light.selected);
  });
});
