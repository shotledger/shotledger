import { canStartShootOff, nextStationIsShootOff } from './falt-shoot-off';

const station = (isShootOff: number) => ({ isShootOff });

describe('fält shoot-off', () => {
  it('starts no shoot-off on an empty round', () => {
    expect(nextStationIsShootOff([])).toBe(false);
    expect(canStartShootOff([])).toBe(false);
  });

  it('offers Start Shoot-off after ordinary stations', () => {
    expect(nextStationIsShootOff([station(0), station(0)])).toBe(false);
    expect(canStartShootOff([station(0), station(0)])).toBe(true);
  });

  it('makes every station after a shoot-off station a shoot-off', () => {
    expect(nextStationIsShootOff([station(0), station(1)])).toBe(true);
    expect(canStartShootOff([station(0), station(1)])).toBe(false);
  });

  it('follows the last station, not an earlier flag', () => {
    expect(nextStationIsShootOff([station(1), station(0)])).toBe(false);
    expect(canStartShootOff([station(1), station(0)])).toBe(true);
  });
});
