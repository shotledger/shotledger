import { nativeLicensesFor } from './native-licenses';

const versions = (os: string) =>
  nativeLicensesFor(os).map((entry) => `${entry.name} ${entry.version}`);

describe('nativeLicensesFor', () => {
  it('lists the Android artifacts on Android', () => {
    expect(versions('android')).toEqual([
      'Google ML Kit Text Recognition 16.0.1',
      'Hermes 0.17.0',
      'OpenCV 4.12.0',
      'SQLite 3.50.3',
    ]);
  });

  it('lists the iOS pods on iOS', () => {
    expect(versions('ios')).toEqual([
      'Google ML Kit Text Recognition 6.0.0',
      'Hermes 0.17.0',
      'OpenCV 4.9.0',
      'SQLite 3.50.3',
    ]);
  });

  it('keeps the Android list on web', () => {
    expect(versions('web')).toEqual(versions('android'));
  });
});
