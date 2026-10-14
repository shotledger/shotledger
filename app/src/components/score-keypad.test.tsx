// What a shooter sees and can do on the score keypad: the chips fill as keys
// are tapped, the running total follows, a full series takes no more shots,
// and decimal mode refuses a second tap that is not a tenth. The rules
// themselves are specified in shared/src/scoring/entry.ts; this checks that
// the keypad renders them faithfully.
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { createKeypadState, enteredShots, type KeypadState } from '@shotledger/shared';

import { ScoreKeypad } from '@/components/score-keypad';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

/** The keypad held the way the series screen holds it: controlled state. */
function Harness({
  initial,
  onState,
}: {
  initial: KeypadState;
  onState?: (state: KeypadState) => void;
}) {
  const [state, setState] = useState(initial);
  return (
    <ScoreKeypad
      state={state}
      onChange={(next) => {
        setState(next);
        onState?.(next);
      }}
    />
  );
}

async function tap(...keys: string[]) {
  for (const key of keys) await fireEvent.press(screen.getByTestId(`key-${key}`));
}

function total() {
  return screen.getByTestId('series-running-total');
}

function chip(n: number) {
  return screen.getByTestId(`shot-${n}`);
}

describe('ScoreKeypad, integer mode', () => {
  const fiveShots = () => createKeypadState({ mode: 'integer', seriesLength: 5 });

  it('offers the digits, both tens and delete, with spoken labels', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
      expect(screen.getByRole('button', { name: key })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'X (Inner Tens)' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
  });

  it('starts empty at a total of 0', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    expect(total()).toHaveTextContent('Series Total: 0');
    for (let n = 1; n <= 5; n++) expect(chip(n)).toHaveTextContent('–');
  });

  it('fills chips left to right and keeps the running total', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    await tap('9');
    expect(chip(1)).toHaveTextContent('9');
    expect(total()).toHaveTextContent('Series Total: 9');

    await tap('10', 'X');
    expect(chip(2)).toHaveTextContent('10');
    expect(chip(3)).toHaveTextContent('X');
    expect(total()).toHaveTextContent('Series Total: 29');
  });

  it('counts an inner ten as ten points and marks only it as inner', async () => {
    let last: KeypadState | null = null;
    await renderWithProviders(<Harness initial={fiveShots()} onState={(s) => (last = s)} />);

    await tap('X', '10');

    expect(total()).toHaveTextContent('Series Total: 20');
    expect(enteredShots(last!)).toEqual([
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 100, isInnerTen: false },
    ]);
  });

  it('refuses a shot past the series length', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    await tap('10', '10', '10', '10', '9');
    expect(total()).toHaveTextContent('Series Total: 49');

    await tap('10', 'X', '5');

    expect(total()).toHaveTextContent('Series Total: 49');
    expect(chip(5)).toHaveTextContent('9');
    expect(screen.queryByTestId('shot-6')).toBeNull();
  });

  it('renders as many chips as the series has shots', async () => {
    await renderWithProviders(
      <Harness initial={createKeypadState({ mode: 'integer', seriesLength: 10 })} />,
    );

    expect(chip(10)).toBeOnTheScreen();
    expect(screen.queryByTestId('shot-11')).toBeNull();
  });

  it('delete removes the last shot and the total drops with it', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    await tap('8', '7', 'backspace');

    expect(chip(2)).toHaveTextContent('–');
    expect(chip(1)).toHaveTextContent('8');
    expect(total()).toHaveTextContent('Series Total: 8');
  });

  it('delete on an empty series does nothing', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    await tap('backspace');

    expect(total()).toHaveTextContent('Series Total: 0');
  });

  it('a tapped chip is selected and the next key overwrites it', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);
    await tap('10', '10', '10', '10', '10');
    expect(total()).toHaveTextContent('Series Total: 50');

    await fireEvent.press(chip(2));
    expect(chip(2)).toBeSelected();
    await tap('6');

    expect(chip(2)).toHaveTextContent('6');
    expect(total()).toHaveTextContent('Series Total: 46');
    expect(chip(2)).not.toBeSelected();
  });

  it('shows a series seeded from stored shots', async () => {
    await renderWithProviders(
      <Harness
        initial={createKeypadState({
          mode: 'integer',
          seriesLength: 5,
          shots: [
            { valueTenths: 100, isInnerTen: true },
            { valueTenths: 70, isInnerTen: false },
          ],
        })}
      />,
    );

    expect(chip(1)).toHaveTextContent('X');
    expect(chip(2)).toHaveTextContent('7');
    expect(chip(3)).toBeSelected();
    expect(total()).toHaveTextContent('Series Total: 17');
  });

  it('shows no decimal hint', async () => {
    await renderWithProviders(<Harness initial={fiveShots()} />);

    expect(screen.queryByText('Two taps per shot: ring, then tenth')).toBeNull();
  });
});

describe('ScoreKeypad, decimal mode', () => {
  const decimal = () => createKeypadState({ mode: 'decimal', seriesLength: 5 });

  it('explains the two-tap entry', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);

    expect(screen.getByText('Two taps per shot: ring, then tenth')).toBeOnTheScreen();
  });

  it('takes a ring then a tenth, and totals in tenths', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);

    await tap('10', '4');
    expect(chip(1)).toHaveTextContent('10.4');
    expect(total()).toHaveTextContent('Series Total: 10.4');

    await tap('9', '7');
    expect(chip(2)).toHaveTextContent('9.7');
    expect(total()).toHaveTextContent('Series Total: 20.1');
  });

  it('a half-entered shot is not a shot yet', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);

    await tap('9');

    expect(chip(1)).toHaveTextContent('–');
    expect(total()).toHaveTextContent('Series Total: 0');
  });

  it('refuses a ten key as the tenth', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);

    await tap('9', '10', 'X');
    expect(chip(1)).toHaveTextContent('–');

    await tap('3');
    expect(chip(1)).toHaveTextContent('9.3');
    expect(total()).toHaveTextContent('Series Total: 9.3');
  });

  it('prints an inner ten in parentheses', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);

    await tap('X', '9', '10', '9');

    expect(chip(1)).toHaveTextContent('(10.9)');
    expect(chip(2)).toHaveTextContent('10.9');
    expect(total()).toHaveTextContent('Series Total: 21.8');
  });

  it('delete after the ring tap undoes only the ring', async () => {
    await renderWithProviders(<Harness initial={decimal()} />);
    await tap('10', '2');

    await tap('8', 'backspace', '7', '1');

    expect(chip(1)).toHaveTextContent('10.2');
    expect(chip(2)).toHaveTextContent('7.1');
    expect(total()).toHaveTextContent('Series Total: 17.3');
  });
});
