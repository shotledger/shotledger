import { formatDate } from '../dates/format';
import { maintenanceEventLines, maintenanceEventTitle } from './maintenance-event-lines';

const sv = (iso: string) => formatDate(iso, 'sv-SE');

describe('maintenanceEventLines', () => {
  it('shows the note under the date', () => {
    expect(
      maintenanceEventLines(
        { performedAt: '2026-10-01T08:00:00.000Z', notes: 'New recoil spring' },
        sv,
      ),
    ).toEqual(['1 okt 2026', 'New recoil spring']);
  });

  it("shows an adjustment's reason, which is stored as its note", () => {
    expect(
      maintenanceEventLines(
        { performedAt: '2026-10-02T09:30:00.000Z', notes: 'Club rental rounds' },
        sv,
      ),
    ).toEqual(['2 okt 2026', 'Club rental rounds']);
  });

  it('adds no line for a missing or blank note', () => {
    expect(
      maintenanceEventLines({ performedAt: '2026-10-03T10:00:00.000Z', notes: null }, sv),
    ).toEqual(['3 okt 2026']);
    expect(
      maintenanceEventLines({ performedAt: '2026-10-03T10:00:00.000Z', notes: '  ' }, sv),
    ).toEqual(['3 okt 2026']);
  });

  it('shows the local day of the instant, not its UTC date', () => {
    // 22:30 UTC on the 3rd is 00:30 on the 4th in Stockholm.
    expect(
      maintenanceEventLines({ performedAt: '2026-10-03T22:30:00.000Z', notes: null }, sv),
    ).toEqual(['4 okt 2026']);
  });
});

describe('maintenanceEventTitle', () => {
  it('A3 labels an adjustment by its flag', () => {
    expect(maintenanceEventTitle({ kind: '', isAdjustment: 1 }, 'Adjustment')).toBe('Adjustment');
  });

  it('A3 shows a kind the user typed as typed, even "adjustment"', () => {
    expect(maintenanceEventTitle({ kind: 'Cleaning', isAdjustment: 0 }, 'Adjustment')).toBe(
      'Cleaning',
    );
    expect(maintenanceEventTitle({ kind: 'adjustment', isAdjustment: 0 }, 'Justering')).toBe(
      'adjustment',
    );
  });
});
