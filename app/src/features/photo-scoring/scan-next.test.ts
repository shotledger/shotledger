import { scanNextTarget, type ScanNextRow } from './scan-next';

function row(position: number, hasResult: boolean, isFinal = false): ScanNextRow {
  return { position, isFinal, hasResult };
}

describe('scanNextTarget', () => {
  describe('freeform session', () => {
    it('always offers a new series after the last one', () => {
      expect(
        scanNextTarget({
          isFixedFormat: false,
          rows: [row(1, true), row(2, true)],
          savedPosition: 2,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 3, isFinal: false });
    });

    it('appends after the highest position even when an earlier series was rescored', () => {
      expect(
        scanNextTarget({
          isFixedFormat: false,
          rows: [row(1, true), row(2, true), row(3, true)],
          savedPosition: 1,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 4, isFinal: false });
    });

    it('follows a new series that has no row until it is saved', () => {
      expect(
        scanNextTarget({
          isFixedFormat: false,
          rows: [row(1, true), row(2, true)],
          savedPosition: 3,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 4, isFinal: false });
    });

    it('keeps a final series in the final', () => {
      expect(
        scanNextTarget({
          isFixedFormat: false,
          rows: [row(1, true), row(2, true, true)],
          savedPosition: 2,
          savedIsFinal: true,
        }),
      ).toEqual({ position: 3, isFinal: true });
    });
  });

  describe('fixed-format session', () => {
    it('goes to the next empty pre-created series', () => {
      expect(
        scanNextTarget({
          isFixedFormat: true,
          rows: [row(1, true), row(2, true), row(3, false), row(4, false)],
          savedPosition: 2,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 3, isFinal: false });
    });

    it('skips series already filled', () => {
      expect(
        scanNextTarget({
          isFixedFormat: true,
          rows: [row(1, true), row(2, true), row(3, true), row(4, false)],
          savedPosition: 2,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 4, isFinal: false });
    });

    it('wraps to an earlier empty series when none is left after this one', () => {
      expect(
        scanNextTarget({
          isFixedFormat: true,
          rows: [row(1, false), row(2, true), row(3, true)],
          savedPosition: 3,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 1, isFinal: false });
    });

    it('counts the series being saved as filled before its save lands', () => {
      expect(
        scanNextTarget({
          isFixedFormat: true,
          rows: [row(1, true), row(2, false), row(3, false)],
          savedPosition: 2,
          savedIsFinal: false,
        }),
      ).toEqual({ position: 3, isFinal: false });
    });

    it('is not offered once every other series is filled', () => {
      expect(
        scanNextTarget({
          isFixedFormat: true,
          rows: [row(1, true), row(2, true), row(3, false)],
          savedPosition: 3,
          savedIsFinal: false,
        }),
      ).toBeNull();
    });
  });
});
