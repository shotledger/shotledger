import { maintenanceEventLines } from './maintenance-event-lines';

describe('maintenanceEventLines', () => {
  it('shows the note under the date', () => {
    expect(
      maintenanceEventLines({
        performedAt: '2026-10-01T08:00:00.000Z',
        notes: 'New recoil spring',
      }),
    ).toEqual(['2026-10-01', 'New recoil spring']);
  });

  it("shows an adjustment's reason, which is stored as its note", () => {
    expect(
      maintenanceEventLines({
        performedAt: '2026-10-02T09:30:00.000Z',
        notes: 'Club rental rounds',
      }),
    ).toEqual(['2026-10-02', 'Club rental rounds']);
  });

  it('adds no line for a missing or blank note', () => {
    expect(maintenanceEventLines({ performedAt: '2026-10-03T10:00:00.000Z', notes: null })).toEqual(
      ['2026-10-03'],
    );
    expect(maintenanceEventLines({ performedAt: '2026-10-03T10:00:00.000Z', notes: '  ' })).toEqual(
      ['2026-10-03'],
    );
  });
});
