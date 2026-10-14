import { buildSessionShareCard, buildSeriesShareCard } from './card-model';

describe('buildSessionShareCard', () => {
  const base = {
    appName: 'ShotLedger',
    dateLabel: '1 Sep 2026',
    disciplineLabel: 'Precision',
    weaponLabel: 'C 2',
    firearmLabel: 'Glock 17',
    totalLabel: '288',
    averageLabel: '48.0',
    xCount: 3,
    note: null,
  };

  it('drops sighter series from the list', () => {
    const model = buildSessionShareCard({
      ...base,
      series: [
        { position: 0, isSighter: true, totalLabel: '45', xCount: 0 },
        { position: 1, isSighter: false, totalLabel: '48', xCount: 1 },
        { position: 2, isSighter: false, totalLabel: '50', xCount: 2 },
      ],
    });
    expect(model.series).toEqual([
      { position: 1, totalLabel: '48', xCount: 1 },
      { position: 2, totalLabel: '50', xCount: 2 },
    ]);
  });

  it('drops shoot-off series from the list: neither is part of the score (#727 PR C, S2)', () => {
    const model = buildSessionShareCard({
      ...base,
      series: [
        { position: 1, isSighter: false, isShootOff: false, totalLabel: '48', xCount: 1 },
        { position: 2, isSighter: false, isShootOff: true, totalLabel: '50', xCount: 5 },
        { position: 3, isSighter: false, totalLabel: '47', xCount: 0 },
      ],
    });
    expect(model.series).toEqual([
      { position: 1, totalLabel: '48', xCount: 1 },
      { position: 3, totalLabel: '47', xCount: 0 },
    ]);
  });

  it('normalizes a blank or whitespace-only note to null', () => {
    expect(buildSessionShareCard({ ...base, series: [], note: null }).note).toBeNull();
    expect(buildSessionShareCard({ ...base, series: [], note: '' }).note).toBeNull();
    expect(buildSessionShareCard({ ...base, series: [], note: '   ' }).note).toBeNull();
  });

  it('trims a real note and keeps optional fields as-is', () => {
    const model = buildSessionShareCard({ ...base, series: [], note: '  good group  ' });
    expect(model.note).toBe('good group');
    expect(model.weaponLabel).toBe('C 2');
    expect(model.firearmLabel).toBe('Glock 17');
  });

  it('turns an empty weapon/firearm label into null', () => {
    const model = buildSessionShareCard({ ...base, weaponLabel: '', firearmLabel: '', series: [] });
    expect(model.weaponLabel).toBeNull();
    expect(model.firearmLabel).toBeNull();
  });
});

describe('buildSeriesShareCard', () => {
  it('passes shots through and normalizes the note', () => {
    const model = buildSeriesShareCard({
      appName: 'ShotLedger',
      dateLabel: '1 Sep 2026',
      disciplineLabel: 'Precision',
      seriesLabel: 'Series 3',
      totalLabel: '48',
      xCount: 2,
      shots: [
        { label: '10', isX: false },
        { label: 'X', isX: true },
      ],
      note: '  ',
    });
    expect(model.shots).toHaveLength(2);
    expect(model.shots[1]).toEqual({ label: 'X', isX: true });
    expect(model.note).toBeNull();
  });
});
